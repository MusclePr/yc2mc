// Youtube to Minecraft Chat
import { LiveChat as YoutubeChat } from "youtube-chat"
import { fetchLivePage } from "youtube-chat/dist/requests"
import { TwitchChat, TwitchToken } from "twitch-chat"
import { Rcon } from "rcon-client"
import Axios from 'axios'
import * as fs from "node:fs"
import express from "express"
import basicAuth from "express-basic-auth"
import * as http from "http"
import WebSocket from "ws"
import { Applicants, ApArray, LiveStreamConfig, LiveStreamConfigArray, GlobalConfig, LiveStreamInfo, LiveStreamInfoArray, MinecraftColor } from "./types/index.d"

// ====================================================================
// 初期定数
// ====================================================================

const HTTP_PORT: number = parseInt(process.env.HTTP_PORT || "8080")
const MCUI_USERNAME: string = process.env.MCUI_USERNAME || "admin"
const MCUI_PASSWORD: string = process.env.MCUI_PASSWORD || "39.da#sd-09/jXa"
const CHANNEL_URL: string = process.env.CHANNEL_URL || ""
const RCON_HOST: string = process.env.RCON_HOST || "localhost" //"host.docker.internal"
const RCON_PORT: number = parseInt(process.env.RCON_PORT || "25575")
const RCON_PASSWORD: string = process.env.RCON_PASSWORD || "minecraft"
const RCON_SEND_ON_LIVE_START: string = process.env.RCON_SEND_ON_LIVE_START || ""
const RCON_SEND_ON_LIVE_END: string = process.env.RCON_SEND_ON_LIVE_END || ""
const KEYWORD : string = process.env.KEYWORD || "^(参加希望|JOIN)"
const KEYWORD_FAILED : string = process.env.KEYWORD_FAILED || "不明なユーザー"
const KEYWORD_FAILED_MEMO : string = process.env.KEYWORD_FAILED_MEMO || "[ERROR] 書式に誤りがあります。"
const KEYWORD_CANCEL : string = process.env.KEYWORD_CANCEL || "^(辞退|CANCEL)"
const MC_CONTAINER : string = process.env.MC_CONTAINER || "yc2mc-mc-1"
//const MC_LOGIN_BLOCKER : string = process.env.MC_LOGIN_BLOCKER || "true"
const LIVE_END_TO_CLEAR_ACCEPT : string = process.env.LIVE_END_TO_CLEAR_ACCEPT || "false"
const TICKET_SERVER : string = process.env.TICKET_SERVER || "ticket:8000"
const DEFAULT_MC_COLOR: MinecraftColor = "gold"
const MC_YOUTUBE_NAME_COLOR : string = process.env.MC_YOUTUBE_NAME_COLOR || DEFAULT_MC_COLOR
// twitch-chat のクライアントIDとシークレット
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'ids1p64r28f77znlfway7vz7j6xfev';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'qzw78q5id4u1rmkqb81w7xjgjenn93';
const LOBBY_HOST = process.env.LOBBY_HOST || "" // ロビーのホスト名
const TP_COMMAND = process.env.TP_COMMAND || "" // ゲートの入り口にテレポートするコマンドを設定する。例："mvtp @s a:mk"
// ニックネームを設定するプラグインの設定
const NICKNAME_YAML = process.env.NICKNAME_YAML || "/data/plugins/NicknameRequired/nicknames.yml" // ニックネームを設定するプラグイン名
const NICKNAME_SET_CMD = process.env.NICKNAME_SET_CMD || "nickset" // ニックネームを設定するコマンド名
const NICKNAME_DEL_CMD = process.env.NICKNAME_DEL_CMD || "nickset" // ニックネームを削除するコマンド名（NicknameRequiredは、nickset と共通）

if (process.env.SETUP_ONLY === "true") {
  process.exit(0)
}

// ====================================================================
// ヘルパー関数
// ====================================================================

// child_process の exec を Promise 化
const util = require('util')
const childProcess = require('child_process')
const exec = util.promisify(childProcess.exec);

// 標準出力を返すだけのヘルパー関数
async function ExecCommand(cmd: string): Promise<string>
{
  //console.log(cmd)
  return exec(cmd).then(
    (result:any) => {
      if (result['stderr']) {
        //console.log(result['stderr'])
        return result['stderr']
      }
      if (result['stdout']) {
        //console.log(result['stdout'])
        return result['stdout']
      }
    }
  )
}

// AUTO_PAUSE 対策で knock する事によりサーバーを起こす
var g_datePrev : Date | null = null
async function KnockServer()
{
  const timeout : number = 1 * 60 * 1000  // 1分以内に knock してたら何もしない。
  let dateNow = new Date()
  if (g_datePrev == null || (dateNow.getTime() - g_datePrev.getTime()) > timeout) {
    g_datePrev = dateNow
    return ExecCommand('knock ' + RCON_HOST + ' 25565') // 注意：サイドコンテナ限定
  }
}

// sleep関数
const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

function toMinecraftColor(color: string): MinecraftColor {
  const validColors: MinecraftColor[] = [
    "black", "dark_blue", "dark_green", "dark_aqua",
    "dark_red", "dark_purple", "gold", "gray", "dark_gray",
    "blue", "green", "aqua", "red", "light_purple",
    "yellow", "white"
  ];

  return validColors.includes(color as MinecraftColor) || 
    (color.startsWith("#") && color.length === 7) ? (color as MinecraftColor) : DEFAULT_MC_COLOR;
}

// ====================================================================
// Ticket のヘルパー関数
// ====================================================================

async function Ticket_fetchText(params : string) : Promise<string>
{
  const url : string = 'http://' + TICKET_SERVER + '/?' + params
  const cmd : string = "curl " + url + " -s"
  try {
    const response : string  = await ExecCommand(cmd)
    return response
  } catch (err) {
    console.log(err)
  }
  return ""
}

async function Ticket_getKey(name: string) : Promise<string>
{
  return Ticket_fetchText('name=' + name)
}

async function Ticket_getID(key: string) : Promise<string>
{
  try {
    const response : string = await Ticket_fetchText('key=' + key)
    let array : string[] = response.split("\n")
    if (array.length > 0) {
      return array[0]
    }
    return response
  } catch (err) {
    console.log(err)
  }
  return ""
}

// ランダムで要素をピックアップ
function getRandomElement<T>(arr: T[]): T | undefined
{
  if (arr.length === 0) return undefined; // 配列が空なら undefined を返す
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}


// ====================================================================
// 認証と express の設定
// ====================================================================

var login_user : string = ''

// express 設定を行う
function myAuthorizer(username: string, password: string) : boolean
{
  if (basicAuth.safeCompare(username, MCUI_USERNAME) && basicAuth.safeCompare(password, MCUI_PASSWORD)) {
    login_user = username
    return true
  }
  return false
}
function getUnauthorizedResponse() {
  return '認証エラー'
}
const app: express.Express = express()
app.use(basicAuth({ authorizer: myAuthorizer, unauthorizedResponse: getUnauthorizedResponse, challenge: true, realm: MC_CONTAINER + '/' + MCUI_USERNAME }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(__dirname + '/assets'))

// HTTPサーバーを作成
const server = http.createServer(app)

// WebSocketサーバーを作成
const wss = new WebSocket.Server({ server })

// WebSocketクライアント管理
const clients = new Set<WebSocket & { isAlive?: boolean }>()

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
  console.log('WebSocket client connected')
  ws.isAlive = true
  clients.add(ws)
  
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('close', () => {
    console.log('WebSocket client disconnected')
    clients.delete(ws)
  })
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    clients.delete(ws)
  })
  
  // 接続時に現在の状態を送信
  const currentStatus = {
    rcon: inRcon,
    live_info_list: g_liveManager.getLiveInfoList(),
    aps: aps
  }
  ws.send(JSON.stringify(currentStatus))
})

// WebSocket生存確認（ハートビート）
const heartbeatInterval = setInterval(() => {
  clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive WebSocket client')
      return ws.terminate()
    }
    
    ws.isAlive = false
    ws.ping()
  })
}, 30000) // 30秒間隔

// 全クライアントに更新を送信
function broadcastUpdate(data: any) {
  const message = JSON.stringify(data)
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// 定期的な参加者ステータスチェック
let periodicStatusCheckInterval: NodeJS.Timeout | null = null

// 定期的なステータスチェック機能を開始
function startPeriodicStatusCheck() {
  if (periodicStatusCheckInterval) {
    clearInterval(periodicStatusCheckInterval)
  }
  
  periodicStatusCheckInterval = setInterval(async () => {
    try {
      // ホワイトリストの連動状態も定期的にチェック（猶予期間の監視のため）
      await g_liveManager.updateWhitelistStatus()

      // 参加者リストが空の場合はそれ以降のチェックをスキップ
      if (aps.length === 0) {
        return
      }
      
      console.log("[DEBUG] Periodic status check started, checking", aps.length, "participants")
      const wasModified = await ApArray_updateAll(false)
      
      if (wasModified) {
        console.log("[DEBUG] Participant states were updated, broadcasting to WebSocket clients")
        
        // 変更があった場合は全クライアントに更新を送信
        const live_info_list = g_liveManager.getLiveInfoList()
        const statusData = {
          request: "status",
          rcon: inRcon,
          live_info_list: live_info_list,
          aps: aps
        }
        
        broadcastUpdate(statusData)
      } else {
        console.log("[DEBUG] No participant state changes detected")
      }
    } catch (error) {
      console.error("[ERROR] Periodic status check failed:", error)
    }
  }, 10000) // 10秒間隔でチェック
  
  console.log("[INFO] Periodic status check started (every 10 seconds)")
}

// 定期的なステータスチェック機能を停止
function stopPeriodicStatusCheck() {
  if (periodicStatusCheckInterval) {
    clearInterval(periodicStatusCheckInterval)
    periodicStatusCheckInterval = null
    console.log("[INFO] Periodic status check stopped")
  }
}

// アプリケーション終了時のクリーンアップ
process.on('SIGINT', () => {
  console.log('\n[INFO] Shutting down gracefully...');
  stopPeriodicStatusCheck();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[INFO] Received SIGTERM, shutting down gracefully...');
  stopPeriodicStatusCheck();
  process.exit(0);
});

// ====================================================================
// Rcon の設定
// ====================================================================

// Rcon クライアント
const rcon = new Rcon({host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD })
let inRcon : 0 | 1 | 2 = 0 // 0=未接続,1=接続済み,2=認証済み
let doEnd : boolean = false // true=Live接続解除要求
let g_isWhitelistOff : boolean = false // 現在ホワイトリストがOFF（誰でも入れる）状態かどうか

// ====================================================================
// ライブの管理
// ====================================================================

function LiveStreamConfig_load(): Promise<GlobalConfig> {
  return new Promise((resolve) => {
    fs.readFile('/config/config.json', 'utf8', (err, data) => {
      if (err) {
        console.log('設定ファイルが見つかりません。デフォルト設定を使用します:', err.message)
        // デフォルト設定を返す
        resolve({ whitelistControlEnabled: true, streams: [] })
        return
      }

      try {
        const json = JSON.parse(data)
        // 配列形式（旧形式）の場合は変換する
        if (Array.isArray(json)) {
          resolve({ whitelistControlEnabled: true, streams: json })
        } else {
          resolve({
            whitelistControlEnabled: json.whitelistControlEnabled ?? true,
            streams: json.streams || []
          })
        }
      } catch (e) {
        console.error('設定ファイルの解析に失敗しました:', e)
        resolve({ whitelistControlEnabled: true, streams: [] })
      }
    })
  })
}

function LiveStreamConfig_save(config: GlobalConfig) : Promise<void>
{
  return new Promise((resolve, reject) => {
    fs.writeFile('/config/config.json', JSON.stringify(config, null, 2), (err) => {
      if (err) {
        console.error(err)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

abstract class LiveStream {
  public info: LiveStreamInfo

  constructor()
  {
    this.info = {
      config: { channelUrl: '', color: 'gold' },
      liveUrl: '',
      title: '',
      status: '開始待機',
      inLive: 0,
      whitelistStatus: 'none',
      lastSeenAliveAt: 0
    }
  }

  setConfig(config: LiveStreamConfig)
  {
    this.info.config = config
  }

  makeLiveAnchor() : string
  {
    return "<a href='" + this.info.liveUrl + "' target=new>" + this.info.title +"</a>"
  }

  // タイトルにマイクラと参加型が含まれているかチェック
  hasWhitelistKeywords() : boolean
  {
    const title = this.info.title || ''
    const hasMinecraft = !!title.match(/minecraft|マインクラフト|マイクラ/i)
    const hasParticipation = !!title.match(/参加型|参加可/)
    return hasMinecraft && hasParticipation
  }

  // 監視スタート
  abstract start(): Promise<boolean>
  // 監視ストップ
  abstract stop(reson?: string): void
  // 定期更新チェック
  abstract checkUpdate(): Promise<void>

}

class YoutubeLiveStream extends LiveStream {
  protected youtube: YoutubeChat | null

  constructor()
  {
    super()
    this.youtube = null
  }

  // 監視スタート
  async start(): Promise<boolean>
  {
    this.stop('開始')
    // YoutubeChat を作成
    let idYoutube: { channelId: string } | { liveId: string } | { handle: string } | null = null
    const url = new URL(this.info.config.channelUrl)
    const videoId = url.searchParams.get('v')
    if (url.pathname.startsWith('/watch') && videoId) {
      idYoutube = { liveId: videoId }
    } else if (url.pathname.startsWith('/@')) {
      idYoutube = { handle: url.pathname.substring(1) }
    } else if (url.pathname.startsWith('/channel/')) {
      let result: RegExpMatchArray | null = url.pathname.match(/^\/channel\/([^\/]+)/)
      if (result && result.length > 1) {
        idYoutube = { channelId: result[1] }
      }
    }
    if (idYoutube) {
      this.info.status = "ライブ確認中"
      this.youtube = new YoutubeChat(idYoutube)
      this.youtube.on("start", (liveId: string) => this.onYoutubeLiveStart(liveId))
      this.youtube.on("end", (reason?: string) => this.onYoutubeLiveEnd(reason))
      this.youtube.on("chat", (chat: any) => this.onYoutubeLiveChat(chat))
      this.youtube.on("error", (error: unknown) => this.onYoutubeLiveError(error))
      return this.youtube.start()
    }
    return false
  }

  // 監視ストップ
  stop(reason?: string)
  {
    if (this.youtube) {
      this.youtube.stop(reason)
      this.youtube = null
    }
    this.info.status = reason ?? '停止'
  }

  onYoutubeLiveStart(liveId : string) : void
  {
    let live = JSON.parse(liveId)
    this.info.liveUrl = "https://www.youtube.com/watch?v=" + live.id
    this.info.title = live.title
    console.log("<開始> " + live.title)
    this.info.inLive = 1
    this.info.status = '転送中'
    let cmd: string = this.info.config.rconCommands?.onStart ?? RCON_SEND_ON_LIVE_START
    onStart(cmd)
  }

  onYoutubeLiveEnd(reason? : string | undefined) : void
  {
    console.log("<終了> reason:" + reason)
    this.info.inLive = 2
    this.info.status = reason || '終了済'
    let cmd: string = this.info.config.rconCommands?.onEnd ?? RCON_SEND_ON_LIVE_END
    onEnd(cmd)
  }

  onYoutubeLiveChat(c : any) : void
  {
    let text = ""
    c.message.forEach(function(e : any) {
      if ( typeof(e) === "object" && 'text' in e) {
        text += e.text
      }
    })
    let name = c.author.name
    // c.author.name は、先頭にハンドルを示す「@」が付いている場合があるので除去
    if (name.startsWith("@")) {
      name = name.substring(1)
    }
    onChat(name, text, this.info.config.color)
    onChatCheck(name, text)
  }

  onYoutubeLiveError(err : unknown) : void
  {
    this.info.inLive = -1
    if (Axios.isAxiosError(err) && err.response) {
      if (err.response.status == 503) {
        this.info.inLive = 0
        console.log("!!! Youtube Server BUSY !!!")
        this.stop("Youtube Server BUSY")
        this.start()  // 再接続
        return
      } else if (err.response.status == 400) {
        console.log("!!! Bad Request, ライブ終了済みかも !!!")
        this.stop("終了？")
      } else {
        console.log(err.response)
        this.stop("HTTP Error:" + err.response.status)
      }
    } else if (err instanceof Error) {
      console.log(err.message)
      let result : RegExpMatchArray | null = err.message.match(/^Live Stream was finished\.\s*(.*)/)
      if (result) {
        this.info.inLive = 2
        this.stop("終了済")
        if (LIVE_END_TO_CLEAR_ACCEPT === "true") ApArray_allKick()
        return
      } else if (err.message.match(/^Live Stream was not found/)) {
        this.stop("予定なし")
      } else if (err.message.match(/^Client Version was not found/)) {
        this.stop("失敗？")
      } else {
        this.info.status = "Error:" + err.message
      }
    } else {
      console.log(err)
      this.info.status = "Error: Internal"
    }
    onError()
  }

  async checkUpdate(): Promise<void>
  {
    const url = new URL(this.info.config.channelUrl)
    const videoId = url.searchParams.get('v')
    
    // チャンネルURL（handle or channelId）の場合のみ
    if (!(url.pathname.startsWith('/watch') && videoId)) {
      console.log(`[CHECK] YouTube channel check: ${this.info.config.channelUrl}`)
      
      let idYoutube: { channelId: string } | { handle: string } | null = null
      if (url.pathname.startsWith('/@')) {
        idYoutube = { handle: url.pathname.substring(1) }
      } else if (url.pathname.startsWith('/channel/')) {
        let result: RegExpMatchArray | null = url.pathname.match(/^\/channel\/([^\/]+)/)
        if (result && result.length > 1) {
          idYoutube = { channelId: result[1] }
        }
      }

      if (idYoutube) {
        try {
          const livePage = await fetchLivePage(idYoutube)
          const newLiveId = livePage.liveId
          const currentLiveId = this.info.liveUrl.match(/[?&]v=([^&]+)/)?.[1]

          if (newLiveId) {
            // 配信中ならタイトルを最新のものに更新する
            if (livePage.title) {
              this.info.title = livePage.title
            }
            if (newLiveId !== currentLiveId) {
              console.log(`[CHECK] New YouTube live detected via fetchLivePage: ${newLiveId} (current: ${currentLiveId})`)
              this.start() // 切り替え
            } else if (this.info.inLive !== 1) {
              // 同じIDだが配信中でない場合（終了済みからの再開など）
              console.log(`[CHECK] YouTube live is same but not in progress. Attempting to restart: ${newLiveId}`)
              this.start()
            }
          }
        } catch (error: any) {
          if (error.message?.match(/Live Stream was not found/)) {
            console.log(`[CHECK] No YouTube live found for ${this.info.config.channelUrl}`)
            this.info.inLive = 0
            this.info.status = "予定なし"
            // WebSocketに通知
            broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
          } else {
            console.error(`[CHECK] fetchLivePage error: ${error.message}`)
          }
        }
      }
    }
  }
}

// このアプリ内で共通の TwitchToken を作成
const g_twitchToken = new TwitchToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET)

class TwitchLiveStream extends LiveStream {
  protected twitch: TwitchChat | null

  constructor()
  {
    super()
    this.twitch = null
  }

  // 監視スタート
  async start(): Promise<boolean>
  {
    this.stop('開始')
    // TwitchChat を作成
    const url = new URL(this.info.config.channelUrl)
    const name = url.pathname.split('/')[1]
    this.twitch = new TwitchChat(name, g_twitchToken)
    if (this.twitch) {
      this.info.status = "ライブ確認中"
      this.twitch.on("connected", (title: string) => this.onTwitchLiveStart(title))
      this.twitch.on("disconnected", (reason: string) => this.onTwitchLiveEnd(reason))
      this.twitch.on('message', (username: string, displayName: string, message: string) => this.onTwitchLiveChat(username, displayName, message))
      this.twitch.on("error", (error: string) => this.onTwitchLiveError(error))
      return this.twitch.connect()
    }
    return false
  }

  // 監視ストップ
  stop(reason?: string)
  {
    if (this.twitch) {
      this.twitch.disconnect()
      this.twitch = null
    }
    this.info.status = reason ?? '停止'
  }

  onTwitchLiveStart(title: string) : void
  {
    this.info.liveUrl = this.info.config.channelUrl + '/live'
    this.info.title = title
    console.log("<開始> " + title)
    this.info.inLive = 1
    this.info.status = '転送中'
    let cmd: string = this.info.config.rconCommands?.onStart ?? RCON_SEND_ON_LIVE_START
    onStart(cmd)
  }

  onTwitchLiveEnd(reason: string) : void
  {
    console.log("<終了>")
    this.info.inLive = 2
    this.info.status = reason || '終了済'
    let cmd: string = this.info.config.rconCommands?.onEnd ?? RCON_SEND_ON_LIVE_END
    onEnd(cmd)
  }

  onTwitchLiveChat(username: string, displayName: string, message: string) : void
  {
    onChat(displayName, message, this.info.config.color)
    onChatCheck(displayName, message)
  }

  onTwitchLiveError(err: string) : void
  {
    this.info.inLive = -1
    if (err.match(/tmi\.twitch\.tv\/connect/)) {
      this.info.inLive = 0
      console.log("!!! Twitch Server BUSY !!!")
      this.stop("Twitch Server BUSY")
      this.start()  // 再接続
      return
    } else if (err.match(/No live stream/)) {
      this.stop("予定なし")
    } else {
      console.log(err)
      this.info.status = "Error: Internal"
    }
    onError()
  }

  async checkUpdate(): Promise<void>
  {
    const url = new URL(this.info.config.channelUrl)
    const name = url.pathname.split('/')[1]
    
    // チャンネルを指定している場合に限り（Twitchは通常そうなる）
    if (name && name.length > 0) {
      if (this.info.inLive !== 1) {
        console.log(`[CHECK] Twitch stream check for restart: ${this.info.config.channelUrl}`)
        this.start()
      }
    }
  }
  
}

function LiveStreamFactory(config: LiveStreamConfig): LiveStream | null
{
  let live: LiveStream | null = null
  let url = normalizeUrl(config.channelUrl)
  if (url.hostname.match(/twitch\.tv/)) {
    const name = url.pathname.split('/')[1]
    if (name.length > 0) {
      live = new TwitchLiveStream()
      live.setConfig(config)
    }
  } else {
    live = new YoutubeLiveStream()
    live.setConfig(config)
  }
  return live
}

// ライブ配信マネージャーは、複数のライブ配信を管理します
class LiveStreamManager
{
  public lives: Array<LiveStream>
  private checkInterval: NodeJS.Timeout | null = null
  private config: GlobalConfig = { whitelistControlEnabled: true, streams: [] }

  constructor()
  {
    this.lives = []
    this.startPeriodicCheck()
  }

  // 設定を取得
  getConfig(): GlobalConfig {
    return {
      whitelistControlEnabled: this.config.whitelistControlEnabled,
      streams: this.lives.map(live => live.info.config)
    }
  }

  // ホワイトリスト連動の有効無効を設定
  async setWhitelistControlEnabled(enabled: boolean) {
    if (this.config.whitelistControlEnabled !== enabled) {
      console.log(`[WHITELIST] Whitelist control enabled set to: ${enabled}`)
      this.config.whitelistControlEnabled = enabled
      await this.save()
      await this.updateWhitelistStatus()
    }
  }

  // 定期的なチェックを開始
  startPeriodicCheck()
  {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    this.checkInterval = setInterval(() => {
      this.checkUpdateAll()
    }, 30 * 60 * 1000) // 30分おき
    console.log("[INFO] Periodic live stream update check started (every 30 minutes)")
  }

  // 全てのライブ配信の更新をチェック
  async checkUpdateAll()
  {
    console.log("[INFO] Checking all live streams for updates...")
    for (const live of this.lives) {
      try {
        await live.checkUpdate()
      } catch (e) {
        console.error(`[ERROR] Failed to check update for ${live.info.config.channelUrl}:`, e)
      }
    }
    // 全てのチェックが終わったらホワイトリスト連動状態を更新
    await this.updateWhitelistStatus()
  }

  // 破棄
  destory()
  {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    for (let i = 0; i < this.lives.length; i++) {
      this.lives[i].stop()
    }
    this.lives = []
  }

  // 読み込み
  async load() {
    // 一旦空にしてから、ロードする
    this.destory()
    this.config = await LiveStreamConfig_load()
    
    for (let i = 0; i < this.config.streams.length; i++) {
      this.add(this.config.streams[i])
    }
    // ロードするものが何もなければ、環境変数で規定されていたやつを設定して開始する
    if (this.config.streams.length == 0) {
      let live = LiveStreamFactory({
        channelUrl: CHANNEL_URL,
        color: toMinecraftColor(MC_YOUTUBE_NAME_COLOR)
      })
      if (live) {
        this.lives.push(live)
      }
      this.save() // 次回のために保存しておく
    }
    this.startPeriodicCheck()
    // 初期状態を判定
    await this.updateWhitelistStatus()
  }

  // 保存
  async save() {
    this.config.streams = this.lives.map(live => live.info.config)
    return LiveStreamConfig_save(this.config)
  }

  // ライブの情報リストを得る
  getLiveInfoList() {
    let live_info_list: LiveStreamInfoArray = []
    for (let i = 0; i < this.lives.length; i++) {
      // 念のため、whitelistStatusが未設定の場合は初期値を設定
      if (this.lives[i].info.whitelistStatus === undefined) {
          this.lives[i].info.whitelistStatus = 'none'
      }
      live_info_list.push(this.lives[i].info)
    }
    return live_info_list
  }

  // チャンネルURLからインデックスを取得
  findIndex(url: string)
  {
    for (let i = 0; i < this.lives.length; i++) {
      if (this.lives[i].info.config.channelUrl === url) {
        return i
      }
    }
    return -1
  }

  // ホワイトリスト連動状態を更新し、必要に応じてRCONコマンドを送信する
  async updateWhitelistStatus()
  {
    const now = Date.now()
    let linkedFound = false
    let anyShouldBeOff = false
    let isModified = false
    const gracePeriod = 3 * 60 * 1000

    // 機能自体がOFFの場合は、全てnoneにして終了
    if (!this.config.whitelistControlEnabled) {
      for (const live of this.lives) {
        if (live.info.whitelistStatus !== "none") {
          live.info.whitelistStatus = "none"
          isModified = true
        }
      }
      
      // ホワイトリストがOFFのままなら戻す
      if (g_isWhitelistOff) {
        console.log("[WHITELIST] Sending 'whitelist on' because whitelist control is disabled globally.")
        if (rcon && inRcon > 1) {
          await KnockServer()
          rcon.send("whitelist on")
          g_isWhitelistOff = false
          isModified = true
        }
      }

      if (isModified) {
        broadcastUpdate({ rcon: inRcon, live_info_list: this.getLiveInfoList(), aps: aps, whitelistControlEnabled: false })
      }
      return
    }

    // どの配信が「連動中」か「連動可」かを判定
    for (const live of this.lives) {
      if (live.info.inLive === 1) {
        live.info.lastSeenAliveAt = now // 配信中なら生存確認時刻を更新
      }

      let newStatus: "none" | "linked" | "linkable" = "none"

      if (live.hasWhitelistKeywords()) {
        const isCurrentlyActive = (live.info.inLive === 1) || (live.info.lastSeenAliveAt > 0 && (now - live.info.lastSeenAliveAt) < gracePeriod)
        
        if (isCurrentlyActive && !linkedFound) {
          newStatus = "linked"
          linkedFound = true
          anyShouldBeOff = true
        } else {
          newStatus = "linkable"
        }
      }

      if (live.info.whitelistStatus !== newStatus) {
        console.log(`[WHITELIST] Status change for ${live.info.config.channelUrl}: ${live.info.whitelistStatus} -> ${newStatus}`)
        live.info.whitelistStatus = newStatus
        isModified = true
      }
    }

    // ホワイトリストのON/OFF制御
    if (anyShouldBeOff) {
      if (!g_isWhitelistOff) {
        console.log("[WHITELIST] Sending 'whitelist off' because a linked stream is active.")
        if (rcon && inRcon > 1) {
          await KnockServer()
          rcon.send("whitelist off")
          g_isWhitelistOff = true
          isModified = true
        }
      }
    } else {
      if (g_isWhitelistOff) {
        console.log("[WHITELIST] Sending 'whitelist on' because no linked streams are active (grace period expired).")
        if (rcon && inRcon > 1) {
          await KnockServer()
          rcon.send("whitelist on")
          g_isWhitelistOff = false
          isModified = true
        }
      }
    }

    if (isModified) {
       broadcastUpdate({ rcon: inRcon, live_info_list: this.getLiveInfoList(), aps: aps, whitelistControlEnabled: this.config.whitelistControlEnabled })
    }
  }

  // 未使用のカラーを得る
  findOtherColor(color?: MinecraftColor) : MinecraftColor
  {
    // 希望するカラーが#で始まる色指定なら、そのまま返す
    if (color !== undefined && color.startsWith("#")) {
      return color
    }
    // 候補リスト
    let validColors: MinecraftColor[] = [
      "black", "dark_blue", "dark_green", "dark_aqua",
      "dark_red", "dark_purple", "gold", "gray", "dark_gray",
      "blue", "green", "aqua", "red", "light_purple",
      "yellow", "white"
    ];
    // 使用中の色は候補リストから除去
    for (let i = 0; i < this.lives.length; i++) {
      const config = this.lives[i].info.config
      if (config.color) {
        let j = validColors.indexOf(config.color)
        if (j > 0) {
          validColors.splice(j, 1)
        }
      }
    }
    // 希望するカラーが残っていたら、それを返す
    if (color !== undefined && validColors.includes(color)) {
      return color
    }
    // 残っている色があれば、ランダムで返す
    let result: MinecraftColor | undefined = getRandomElement(validColors)
    if (result !== undefined) {
      return result
    }
    // 無ければランダムの色を生成する
    let rgb: string = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")
    return `#${rgb}`
  }

  // 監視チャンネルを追加
  add(config: LiveStreamConfig)
  {
    if (!config.color) config.color = this.findOtherColor()
    let i = this.findIndex(config.channelUrl)
    if (i < 0) {
      // 既存のURLと一致しなければ、末尾に追加する
      let live = LiveStreamFactory(config)  // ← LiveStreamFactory を使用
      if (live) {
        this.lives.push(live)
      }
    } else {
      // 一致する場合は、設定を更新する
      this.lives[i].setConfig(config);
    }
    this.save()
  }

  async start(url: string)
  {
    console.log(`LiveStreamManager.start(${url})`)

    let i = this.findIndex(url)
    if (i >= 0) {
      console.log(`found index: ${i} with start`)
      return this.lives[i].start()
    }
    return false
  }

  async stop(url: string)
  {
    let i = this.findIndex(url)
    if (i >= 0) {
      return this.lives[i].stop()
    }
    return false
  }

  async remove(url: string)
  {
    let i = this.findIndex(url)
    if (i >= 0) {
      this.lives[i].stop()
      this.lives.splice(i, 1)
      this.save()
      return true
    }
    return false
  }


  startAll()
  {
    console.log("LiveStreamManager.startAll()")
    this.lives.forEach(live => {
      console.log(typeof live + " " + live.info.config.channelUrl)      
      live.start()
    });
  }

}

let g_liveManager = new LiveStreamManager()

// ====================================================================
// 参加希望者リストの管理
// ====================================================================

// 参加希望者リスト
let aps : ApArray = new Array<Applicants>

// 名前からインデックスを得る
function ApArray_findIndex(name: string) : number
{
  return aps.findIndex(function(value: Applicants, index: number, obj: Applicants[]): boolean { return (value.name === name) }, name)
}

// IDからインデックスを得る
function ApArray_findIndexById(id: string) : number
{
  return aps.findIndex(function(value: Applicants, index: number, obj: Applicants[]): boolean { return (value.id === id) }, id)
}

// 末尾に追加する
function ApArray_add(a : Applicants) : void
{
  if (a.id.length == 0 || a.name.length == 0 || !a.id.match(/[0-9A-Za-z._]+/)) {
    a.id = KEYWORD_FAILED
    a.memo = KEYWORD_FAILED_MEMO
  }
  let idx : number = ApArray_findIndex(a.name)
  let shouldCheckNickname = false;
  
  if (idx < 0) {
    console.log("追加[" + aps.length + "] { id: " + a.id + ", name: " + a.name + ", memo: " + a.memo + ", accept: " + a.accept + ", nicked: " + a.nicked + "}")
    aps.push(a) // 追加
    // 承認済みプレイヤーの場合は即座にニックネーム状態をチェック
    shouldCheckNickname = (a.accept === 1);
  } else {
    a.accept = aps[idx].accept // 状態を引き継ぐ
    a.nicked = aps[idx].nicked // 状態を引き継ぐ
    console.log("更新[" + idx + "] { id: " + a.id + ", name: " + a.name + ", memo: " + a.memo + ", accept: " + a.accept + ", nicked: " + a.nicked + "}")
    aps[idx] = a // 更新
    console.log(a)
    // 承認済みプレイヤーの場合は即座にニックネーム状態をチェック
    shouldCheckNickname = (a.accept === 1);
  }
  
  // 承認済みプレイヤーの場合、即座にニックネーム状態を確認
  if (shouldCheckNickname) {
    console.log(`[ApArray_add] 承認済みプレイヤー ${a.name} のニックネーム状態を即座に確認します`);
    // 非同期でニックネーム状態をチェックし、変更があればWebSocketで通知
    setImmediate(() => {
      const beforeState = JSON.parse(JSON.stringify(aps)); // 状態のコピー
      ApArray_updateAll();
      const afterState = aps;
      
      // 状態に変更があったかチェック
      let hasChanges = false;
      for (let i = 0; i < beforeState.length; i++) {
        if (i < afterState.length && 
            (beforeState[i].nicked !== afterState[i].nicked || 
             beforeState[i].accept !== afterState[i].accept)) {
          hasChanges = true;
          break;
        }
      }
      
      if (hasChanges) {
        console.log(`[ApArray_add] ニックネーム状態に変更が検出されました - WebSocketで通知`);
        const live_info_list = g_liveManager.getLiveInfoList();
        const responseData = { "request": "status", "rcon": inRcon, "live_info_list": live_info_list, "aps": aps };
        broadcastUpdate(responseData);
      }
    });
  }
}

// 名前から削除する
function ApArray_delete(name: string) : boolean
{
  let idx : number = ApArray_findIndex(name)
  if (idx >= 0) {
    aps.splice(idx, 1) // idx位置から1個削除
    return true
  }
  return false
}

// 参加希望者リストを空にする
function ApArray_clear() : void
{
  aps = []
}

// 承認した人を全員サーバーからキックし、参加希望者リストを空にする
function ApArray_allKick()
{
  if (rcon && inRcon > 1) {
    KnockServer()
    for (let i = 0; i < aps.length; i++) {
      const BE : boolean = (aps[i].id.charAt(0) == '.')
      if (aps[i].memo.startsWith("[OK] ")) {
        rcon.send('kick ' + aps[i].id + ' 参加型配信は終了しました。次の配信でお会いしましょう。')
        // MEMO:キックするけど、承諾したままのため、ホワイトリストをONにしない限り入れるのは仕様です。
      }
    }
  }
  ApArray_clear() // 参加希望者リストを空にする
}

// 前回の更新日時
let g_ApArray_datePrev : Date | null = null
// 参加申請済みの参加者の状態を更新する
async function ApArray_updateAll(force : boolean = false) : Promise<boolean>
{
  // 前回から3秒以内の要求は無視します
  if (!force && g_ApArray_datePrev && (new Date().getTime() - g_ApArray_datePrev.getTime()) < 3000) {
    return false
  }
  g_ApArray_datePrev = new Date() // 更新日時を記録
  let bModified : boolean = false // 更新されたかどうか
  try {
    for (let i = 0; i < aps.length; i++) {
      if (!aps[i].nicked) {
        // 未ログイン
        const id: string = aps[i].id.replace(/^\./, "__bedrock__")
        if (id === KEYWORD_FAILED) continue
        const cmd: string = "yq '.players." + id + ".flag' " + NICKNAME_YAML
        //console.log("[DEBUG] Checking nickname status for:", aps[i].name, "id:", id, "cmd:", cmd)
        let flag = await ExecCommand(cmd)
        if (flag.length > 0) {
          flag = flag.trimEnd()
          //console.log("[DEBUG] Trimmed flag for", aps[i].name, ":", flag)
          if (flag == "1") {
            const BE : boolean = (aps[i].id.charAt(0) == '.')
            aps[i].memo = !BE ? "[OK] Java版" : "[OK] 統合版"
            aps[i].accept = BE ? 2 : 1
            aps[i].nicked = true
            bModified = true
          }
        }
      }
    }
  } catch (e) {
    console.log(e)
  }
  return bModified
}

// 絵文字除去
const RemoveEmoji = (in_value : string) => {
  const ranges = [
    '[\ud800-\ud8ff][\ud000-\udfff]', // 基本的な絵文字除去
    '[\ud000-\udfff]{2,}', // サロゲートペアの二回以上の繰り返しがあった場合
    '\ud7c9[\udc00-\udfff]', // 特定のシリーズ除去
    '[0-9|*|#][\uFE0E-\uFE0F]\u20E3', // 数字系絵文字
    '[0-9|*|#]\u20E3', // 数字系絵文字
    '[©|®|\u2010-\u3fff][\uFE0E-\uFE0F]', // 環境依存文字や日本語との組み合わせによる絵文字
    '[\u2010-\u2FFF]', // 指や手、物など、単体で絵文字となるもの
    '\uA4B3', // 数学記号の環境依存文字の除去
  ];
   
  const reg = new RegExp(ranges.join('|'), 'g');
  let retValue = in_value.replace(reg, '');
  // パターンにマッチする限り、除去を繰り返す（一回の正規表現除去では除去しきないパターンがあるため）
  while (retValue.match(reg)) {
    retValue = retValue.replace(reg, '');
  }
 
  // 二重で絵文字チェック（4バイト、サロゲートペアの残りカス除外）
  return retValue.split('').reduce((p : string, c : string) => {
    const surrogatePairCode = [
      65038,
      65039,
      8205,
      11093,
      11035
    ];
      const code = c.charCodeAt(0);
    if (
      encodeURIComponent(c).replace(/%../g, 'x').length < 4 &&
      !surrogatePairCode.some(codeNum => code == codeNum)
    ) {
      return p += c;
    } else {
      return p;
    }
 
  }, '');
}

// 半角→全角
function Hankaku2Zenkaku(str: string) {
  return str.replace(/[A-Za-z0-9]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) + 0xFEE0);
  });
}

// 全角→半角(英数字)
function Zenkaku2Hankaku(str: string) {
  return str.replace(/[！-～]/g, function(s){
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  })
}

// PlayerIDフィルター
function filterPlayerID(str: string) { 
  return Zenkaku2Hankaku(str).replace(/[^A-Za-z0-9._]/ug, "") // 英数字・ピリオド・アンダーバー以外は除去
}

function SetNickName(id: string, nick: string) : boolean
{
  if (rcon && inRcon > 1) {
    KnockServer()
    // Youtube名：🌈RAINBOW PEGASUS🦄（HN:PEGASUS）
    // 絵文字除去：RAINBOW PEGASUS（HN:PEGASUS）
    let new_nick = RemoveEmoji(nick)
    if (new_nick.length > 0) nick = new_nick // 絵文字だけの場合、削除しない
    //console.log("絵文字除去後のニックネーム：" + nick)
    // 空白と記号は除去：RAINBOW
    let new_nicks = nick.split(/[ !--/:-?[-^`{-~　！-－：-？［-＾‘｛-～「」【】《》]/u)
    for (let n of new_nicks) {
      if (n.length > 0) {
        nick = n
        break
      }
    }
    //console.log("空白と記号以降除去後のニックネーム：" + nick)
    // 半角→全角：ＲＡＩＮＢＯＷ
    nick = Hankaku2Zenkaku(nick)
    //console.log("半角→全角後のニックネーム：" + nick)
    // １６文字まで
    const MAX_NICK_LENGTH : number = 16
    if (nick.length > MAX_NICK_LENGTH) nick = nick.slice(0, MAX_NICK_LENGTH)
    //console.log("１６文字までのニックネーム：" + nick)
    // コマンド文字列：<NICKNAME_SET_CMD> <id> <nick>
    if (nick.length > 0) {
      let command : string = NICKNAME_SET_CMD + ' ' + id + ' ' + nick
      console.log(command)
      rcon.send(command)
      return true
    }
  }
  return false
}

async function SendLobbyCommand(cmd: string) : Promise<string>
{
  if (LOBBY_HOST && cmd.length > 0) {
    let command : string = "docker exec " + LOBBY_HOST + " rcon-cli '" + cmd + "'"
    console.log(command)
    return ExecCommand(command)
  }
  return ""
}

async function SendAcceptMessage(id: string, name: string, memo: string) : Promise<boolean>
{
  if (LOBBY_HOST) {
    await SendLobbyCommand('tellraw ' + id + ' {"text":"参加希望が承諾されました。","color":"green"}')
    await SendLobbyCommand('tellraw ' + id + ' {"text":"ようこそ、' + name + 'さん","color":"white"}')
    await SendLobbyCommand('tellraw ' + id + ' {"text":"ゲートをお通りください。","color":"white"}')
    await SendLobbyCommand('title ' + id + ' subtitle {"text":"ゲートをお通りください。","color":"white"}')
    await SendLobbyCommand('title ' + id + ' title {"text":"承諾されました！","color":"green"}')
    if (TP_COMMAND.length > 0) {
      let tp_cmd: string = TP_COMMAND.replace(/@s/g, id) // @s を id に置換
      await SendLobbyCommand(tp_cmd)
    }
    return true
  }
  return false
}

// ====================================================================
// 配信転送の管理
// ====================================================================

// 転送開始時
function onStart(cmd: string)
{
  console.log('onStart()')
  if (rcon && inRcon > 1) {
    KnockServer()
    rcon.send('title @a subtitle "開始"')
    rcon.send('title @a title "配信コメント転送"')
    rcon.send('tellraw @a {"text":"<配信コメント転送開始>","color":"red"}')
    // 環境変数を直接参照する事は廃止し、タイトルに応じた動的制御に移行するため、
    // ここでの cmd (RCON_SEND_ON_LIVE_START相当) の実行は行わないか、
    // あるいはホワイトリストコマンド以外に限定する。
    // 今回はユーザーの「環境変数参照は廃止」との意向を汲み、ホワイトリスト制御は 
    // updateWhitelistStatus で一括管理するため、ここでは何もしない。
  }
  
  // WebSocketクライアントに状態更新を通知
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
  
  // ホワイトリストの状態を即座に判定
  g_liveManager.updateWhitelistStatus()
}

// 転送終了時
function onEnd(cmd: string)
{
  console.log('onEnd()')
  if (rcon && inRcon > 1) {
    KnockServer()
    rcon.send('title @a subtitle "終了"')
    rcon.send('title @a title "配信コメント転送"')
    rcon.send('tellraw @a {"text":"<配信コメント転送終了>","color":"red"}')
    // 同様に、ここでの cmd (RCON_SEND_ON_LIVE_END相当) の実行も廃止。
  }
  
  // WebSocketクライアントに状態更新を通知
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })

  // ホワイトリスト状態を更新（猶予期間のカウントダウン開始の契機となる）
  g_liveManager.updateWhitelistStatus()
}

// 転送開始後にエラーが発生した時
function onError()
{
  console.log('onError()')
  if (rcon && inRcon > 1) {
    KnockServer()
    //rcon.send('title @a subtitle "エラー停止"')
    //rcon.send('title @a title "配信コメント転送"')
    rcon.send('tellraw @a {"text":"<配信コメント転送エラー>","color":"red"}')
  }
  
  // WebSocketクライアントに状態更新を通知
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
}

// チャットの転送
function onChat(name: string, text: string, color?: MinecraftColor)
{
  if (rcon && inRcon > 1) {
    KnockServer()
    var id = JSON.stringify('<' + name + '> ')
    var msg = JSON.stringify(text)
    if (!color) color = DEFAULT_MC_COLOR
    const cmd : string = 'tellraw @a ["",{"color":"' + color + '","text":' + id + '},{"color":"white","text":' + msg + '}]'
    rcon.send(cmd)
  }
  const param : string = '<' + name + '> ' + text
  console.log(param)
}

// チャットのチェック
async function onChatCheck(name: string, text: string)
{
  let bModified : boolean = false
  if (KEYWORD_CANCEL && text.match(RegExp(KEYWORD_CANCEL))) {
    ApArray_delete(name)
    bModified = true
  } else if (text.match(RegExp(KEYWORD))) {
    const matcher : string = KEYWORD + "[\\s　、。・／/％%:：]*([\\w\\.]+)[\\s　＠@・／/]*(.*)$"
    let result : RegExpMatchArray | null = text.match(RegExp(matcher))
    let id : string = result && result.length > 3 ? filterPlayerID(result[2]): ""
    if (result && result.length > 3 && id.length > 0) {
      let a : Applicants = { id: id, name: name, memo: result[3], accept: 0, nicked: false}
      ApArray_add(a)
      bModified = true
    } else if (KEYWORD_FAILED) {
      result = text.match(RegExp(KEYWORD))
      if (result) {
        ApArray_add({id: KEYWORD_FAILED, name: name, memo: KEYWORD_FAILED_MEMO, accept: 0, nicked: false})
        bModified = true
      }
    }
  } else {
    let result : RegExpMatchArray | null = text.match(RegExp("^[#＃]([0-9a-fA-F０-９ａ-ｆＡ-Ｆ]{4})"));
    if (result && result.length >= 2) {
      let key : string = result && result.length >= 2 ? Zenkaku2Hankaku(result[1]).toLowerCase() : ""
      console.log("key=\"" + key + "\"")
      if (key.length > 0) {
        Ticket_getID(key).then((id : string) => {
          console.log("id=\"" + id + "\"")
          if (id.length > 0) {
            ApArray_add({id: id, name: name, memo: "from Hub", accept: 0, nicked: false})
            bModified = true
          }
        })
      }
    }
  }
  if (await ApArray_updateAll()) {
    bModified = true
  }
  if (bModified) {
    // WebSocketクライアントに状態更新を通知
    broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
  }
}

// ====================================================================
// RCon の管理
// ====================================================================

rcon.on("connect", () => {
  console.log("<rcon> connected")
  inRcon = 1
  // WebSocket経由で状態更新を送信
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
})

rcon.on("authenticated", () => {
  console.log("<rcon> authenticated")
  inRcon = 2
  // WebSocket経由で状態更新を送信
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
})

rcon.on("end", () => {
  console.log("<rcon> end")
  inRcon = 0
  doEnd = true
  // WebSocket経由で状態更新を送信
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
})

rcon.on("error", () => {
  console.log("<rcon> error")
  inRcon = 0
  doEnd = true
  // WebSocket経由で状態更新を送信
  broadcastUpdate({ rcon: inRcon, live_info_list: g_liveManager.getLiveInfoList(), aps: aps })
})

// ====================================================================
// Web API の管理
// ====================================================================

function normalizeUrl(url: string): URL
{
  return new URL(url, "https://youtube.com/")
}

//GETリクエストの設定
//'/'でアクセスされた時に、JSONとログを出力するようにする
app.get('/start', (req : express.Request, res : express.Response) => {
  console.log('startのGETリクエストを受け取りました')
  const params = new URLSearchParams(req.query as any)
  console.log(params.toString())
  if (params.has('url')) {
    let url = normalizeUrl(params.get('url')!).toString()
    console.log(`url: ${url}`)
    if (params.has('color')) {
      let color = toMinecraftColor(params.get('color')!)
      console.log(`color: ${color}`)
      g_liveManager.add({ channelUrl: url, color: color })
    } else {
      g_liveManager.add({ channelUrl: url })
    }
    g_liveManager.start(url)
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "start", "rcon": inRcon, "live_info_list": live_info_list}
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/stop', (req : express.Request, res : express.Response) => {
  console.log('stopのGETリクエストを受け取りました')
  if (req.query?.url && typeof(req.query.url) === 'string') {
    let url = normalizeUrl(req.query.url).toString()
    g_liveManager.stop(url)
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "stop", "rcon": inRcon, "live_info_list": live_info_list}
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/remove', (req : express.Request, res : express.Response) => {
  console.log('removeのGETリクエストを受け取りました')
  if (req.query?.url && typeof(req.query.url) === 'string') {
    let url = normalizeUrl(req.query.url).toString()
    g_liveManager.remove(url)
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "remove", "rcon": inRcon, "live_info_list": live_info_list}
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/whitelist-control', (req : express.Request, res : express.Response) => {
  if (req.query.enabled !== undefined) {
    const enabled = req.query.enabled === 'true'
    g_liveManager.setWhitelistControlEnabled(enabled)
    res.json({ status: 'ok', enabled: enabled })
  } else {
    res.json({ enabled: g_liveManager.getConfig().whitelistControlEnabled })
  }
  res.end()
})

app.get('/status', (req : express.Request, res : express.Response) => {
  ApArray_updateAll(true) // 参加希望者リストを更新

  let live_info_list = g_liveManager.getLiveInfoList()
  const statusData = { "request": "status", "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(statusData)
  //console.log('statusのGETリクエストを受け取りました')
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(statusData)
  //WelcomeCheck() // 定期的にログインチェックする
})

app.get('/clear', (req : express.Request, res : express.Response) => {
  console.log('clearのGETリクエストを受け取りました')
  ApArray_clear() // 参加希望者リストを空にする
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "clear", "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/reset', (req : express.Request, res : express.Response) => {
  console.log('resetのGETリクエストを受け取りました')
  if (rcon && inRcon > 1) {
    KnockServer()
    for (let i = 0; i < aps.length; i++) {
      const BE : boolean = (aps[i].id.charAt(0) == '.')
      if (aps[i].memo.startsWith("[OK] ")) {
        aps[i].memo = !BE ? "[NG] Java版" : "[NG] 統合版"
      }
      aps[i].accept = 0 // 未承認
      rcon.send(NICKNAME_DEL_CMD + ' ' + aps[i].id)
      rcon.send('kick ' + aps[i].id + ' すべての参加申請をリセットしました。')
    }
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "reset", "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/add', (req : express.Request, res : express.Response) => {
  console.log('addのGETリクエストを受け取りました')
  let id : string = "Muscle_p"
  let name : string = "まっする"
  let memo : string = "Java"
  if (req.query) {
    if (req.query.id != undefined && typeof(req.query.id) === 'string') id = req.query.id
    if (req.query.name != undefined && typeof(req.query.name) === 'string') name = req.query.name
    if (req.query.memo != undefined && typeof(req.query.memo) === 'string') memo = req.query.memo
  }
  let a : Applicants = {id: filterPlayerID(id), name: name, memo: memo, accept: 0, nicked: false}
  ApArray_add(a)
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "add", "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/delete', (req : express.Request, res : express.Response) => {
  console.log('deleteのGETリクエストを受け取りました')
  let name : string = ""
  let id : string = ""
  let deny : string = ""
  if (req.query) {
    if (req.query.name != undefined && typeof(req.query.name) === 'string') name = req.query.name
    if (req.query.id != undefined && typeof(req.query.id) === 'string') id = req.query.id
    if (req.query.deny != undefined && typeof(req.query.deny) === 'string') deny = req.query.deny
  }
  let result : boolean = false
  if (rcon && inRcon > 1) {
    KnockServer()
    let idx : number = ApArray_findIndex(name)
    if (idx >= 0) {
      if (id == "") id = aps[idx].id
      const BE : boolean = (id.charAt(0) == '.')
      aps[idx].memo = !BE ? "[OK] Java版" : "[OK] 統合版"
      aps[idx].accept = BE ? 2 : 1
      /*
      const cmd1 : string = 'scoreboard players set ' + id + ' joinGame 3'
      const cmd2 : string = 'pardon ' + id
      console.log(cmd1)
      rcon.send(cmd1)
      console.log(cmd2)
      rcon.send(cmd2)
      */
      if (deny == "1" && id != "") {
        rcon.send(NICKNAME_DEL_CMD + ' ' + id)
        rcon.send('kick ' + id + ' 参加申請を却下しました。')
      }
      result = ApArray_delete(name)
    }
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "delete", "result": result, "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/accept', (req : express.Request, res : express.Response) => {
  console.log('acceptのGETリクエストを受け取りました')
  let name : string = "まっする"
  let id : string = ""
  if (req.query) {
    if (req.query.name != undefined && typeof(req.query.name) === 'string') name = req.query.name
    if (req.query.id != undefined && typeof(req.query.id) === 'string') id = req.query.id
  }
  let result : boolean = false
  if (rcon && inRcon > 1) {
    KnockServer()
    let idx : number = ApArray_findIndex(name)
    if (idx >= 0) {
      if (id == "") id = aps[idx].id
      const BE : boolean = (id.charAt(0) == '.')
      result = SetNickName(id, aps[idx].name)
      if (result) {
        aps[idx].memo = !BE ? "[OK] Java版" : "[OK] 統合版"
        aps[idx].accept = BE ? 2 : 1
        /*
        const cmd1 : string = 'scoreboard players set ' + id + ' joinGame 3'
        const cmd2 : string = 'pardon ' + id
        console.log(cmd1)
        rcon.send(cmd1)
        console.log(cmd2)
        rcon.send(cmd2)
        */
        SendAcceptMessage(id, aps[idx].name, aps[idx].memo)
      } else {
        console.log(id + " のニックネーム「" + aps[idx].name + "」の設定に失敗しました")
      }
    }
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "accept", "result": result, "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/deny', (req : express.Request, res : express.Response) => {
  console.log('denyのGETリクエストを受け取りました')
  let name : string = "まっする"
  let id : string = ""
  if (req.query) {
    if (req.query.name != undefined && typeof(req.query.name) === 'string') name = req.query.name
    if (req.query.id != undefined && typeof(req.query.id) === 'string') id = req.query.id
  }
  let result : boolean = false
  if (rcon && inRcon > 1) {
    KnockServer()
    const BE : boolean = (id.charAt(0) == '.')
    let idx : number = ApArray_findIndex(name)
    if (idx >= 0) {
      if (id == "") id = aps[idx].id
      const BE : boolean = (id.charAt(0) == '.')
      aps[idx].memo = !BE ? "[NG] Java版" : "[NG] 統合版"
      aps[idx].accept = 0
      /*
      rcon.send('scoreboard players reset ' + id + ' joinGame')
      */
      if (id != "") {
        rcon.send(NICKNAME_DEL_CMD + ' ' + id)
        rcon.send('kick ' + id)
      }
      result = true
    }
  }
  let live_info_list = g_liveManager.getLiveInfoList()
  const responseData = { "request": "deny", "result": result, "rcon": inRcon, "live_info_list": live_info_list, "aps": aps }
  res.json(responseData)
  res.end()
  
  // WebSocket経由で更新を送信
  broadcastUpdate(responseData)
})

app.get('/logout', (req : express.Request, res : express.Response) => {
  console.log('/logout の GET リクエストを受け取りました')
  res.status(401).send('{ "status": "401" }').end()
})

app.get('/', (req : express.Request, res : express.Response) => {
  console.log('/ の GET リクエストを受け取りました')
  const buffer : Buffer = fs.readFileSync(__dirname + '/assets/top.html')
  let text: string = buffer.toString()
  text = text.replaceAll('${user}', login_user)
  res.send(text)
  res.end()
})

// ====================================================================
// メインループ内のループ処理
// ====================================================================

async function loop(bAutoStart : boolean)
{
  console.log("yc2mc service start")
  doEnd = false
  await g_liveManager.load()

  // サーバーがRcon接続が完了するまで接続を繰り返し待つ
  inRcon = 0
  while (inRcon == 0) {
    try {
      await KnockServer()
      await rcon.connect()
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.match(/^connect ECONNREFUSED/)) {
          // No message.
        } else {
          console.log(e.message)
        }
      } else {
        console.log(e)
      }
      if (rcon.socket && !rcon.socket.connecting && rcon.socket.writable) {
        console.log('loop() ... start ... rcon.end()')
        await rcon.end()
        console.log('rcon.end() ... done')
      }
      await sleep(2000)
    }
    await sleep(1000)
  }

  if (bAutoStart) g_liveManager.startAll()
  while (!doEnd) {
    doEnd = false
    await sleep(1000)
  }

  if (rcon.socket && !rcon.socket.connecting && rcon.socket.writable) {
    console.log('loop() ... end ... rcon.end()')
    await KnockServer()
    await rcon.end() // AUTOPAUSE時にタイムアウトエラーが発生する
    console.log('rcon.end() ... done')
  }
  //process.exit()
}

// ====================================================================
// 安全に終了させる処理
// ====================================================================

var bMainLoop: boolean = true

async function closeGracefully(signal : string)
{
  console.log(`*^!@4=> Received signal to terminate: ${signal}`)

  try {
    bMainLoop = false
    g_liveManager.destory()
    clearInterval(heartbeatInterval)

    if (rcon.socket && !rcon.socket.connecting && rcon.socket.writable) {
      await KnockServer()
      await rcon.end() // AUTOPAUSE時にタイムアウトエラーが発生する
    } 
  } catch (e : any) {
    console.log(e)
  }
  process.exit()
}
process.on('SIGINT', closeGracefully)
process.on('SIGTERM', closeGracefully)

// ====================================================================
// メイン処理
// ====================================================================

var bAutoStart : boolean = true

async function main()
{
  while (bMainLoop) {
    try {
      await loop(bAutoStart)
    } catch (e : any) {
      console.log(e)
    }
    bAutoStart = false
    await sleep(1000)
  }
}

//DetectLogin(MC_CONTAINER)
main().catch(console.error)

// 8080番ポートでサーバーを待ちの状態にする。
// またサーバーが起動したことがわかるようにログを出力する
server.listen(HTTP_PORT, () => {
  console.log("Youtube to Minecraft Chat サービス起動中");
  
  // 定期的な参加者ステータスチェックを開始
  startPeriodicStatusCheck();
})
