// Youtube to Minecraft Chat
import { LiveChat } from "youtube-chat"
import { Rcon } from "rcon-client"
import Axios from 'axios'
import dotenv from "dotenv"
import * as fs from "node:fs"
import express from "express"
import basicAuth from "express-basic-auth"
import { Applicants, ApArray } from "./types/index.d"

// ====================================================================
// 前提モジュールの初期化
// ====================================================================

const TMPENV: string = "/var/tmp/.env"
dotenv.config({ path: TMPENV })
fs.unlink(TMPENV, (err) => { if (!(err?.errno == -2 && err?.code === 'ENOENT')) console.log(err) })

// ====================================================================
// 初期定数
// ====================================================================

const HTTP_PORT: number = parseInt(process.env.HTTP_PORT || "8080")
const MCUI_USERNAME: string = process.env.MCUI_USERNAME || "admin"
const MCUI_PASSWORD: string = process.env.MCUI_PASSWORD || "39.da#sd-09/jXa"
const CHANNEL_ID: string = process.env.CHANNEL_ID || ""
var LIVE_ID: string = process.env.LIVE_ID || ""
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
const MC_YOUTUBE_NAME_COLOR : string = process.env.MC_YOUTUBE_NAME_COLOR || "gold"
const SETUP_ONLY: string = process.env.SETUP_ONLY || "false"

if (SETUP_ONLY === "true") {
  process.exit(0)
}

// ====================================================================
// Docker関連のヘルパー関数
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

var datePrev : Date | null = null
async function KnockServer()
{
  const timeout : number = 1 * 60 * 1000  // 1分以内に knock してたら何もしない。
  let dateNow = new Date()
  if (datePrev == null || (dateNow.getTime() - datePrev.getTime()) > timeout) {
    datePrev = dateNow
    return ExecCommand('knock ' + RCON_HOST + ' 25565') // 注意：サイドコンテナ限定
  }
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

/*
function DetectLogin(container: string)
{
  if (container === "") return
  console.log("監視対象コンテナ:" + container)
  let p = childProcess.spawn("docker", ["logs", "--since", "0s", "-f", container])
  p.on('exit', ()=>{console.log('exit')})
  p.stdout.setEncoding('utf-8');
  p.stdout.on('data', (data:string)=>{
    process.stdout.write(data)
    if (data.indexOf("logged in with entity id") > 0) {
      // 特定
      let result:RegExpMatchArray | null = data.match(RegExp("^\\[.+INFO\\]\: (\\.?\\w+)\\[.+\\] logged in"))
      console.log("ログイン検出:", result ? result[1] : "IDを抽出できませんでした")
      // ニックネーム付与
      let id = result ? result[1] : null
      if (id) {
        let i = ApArray_findIndexById(id)
        if (i >= 0 && aps[i].accept > 0 && !aps[i].nicked) {
          if (WelcomeNick(id, aps[i].name)) {
            aps[i].nicked = true
          }
        }
      }
      //if (MC_LOGIN_BLOCKER === "true") WelcomeCheck()
    }
  })
  p.stderr.on('data', (data:string)=>{
    process.stderr.write(data)
  })
}
*/
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

// 8080番ポートでサーバーを待ちの状態にする。
// またサーバーが起動したことがわかるようにログを出力する
app.listen(HTTP_PORT, () => {
  console.log("Youtube to Minecraft Chat サービス起動中");
})

// Rcon クライアント
const rcon = new Rcon({host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD })

// チャンネルIDを指定すれば、自動で配信中のライブIDを指定してくれる
var liveChat : LiveChat | null = null

// sleep関数
const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

// 終了フラグ
let doLoop : boolean = true // true=Live接続維持または待機維持
let doStart : boolean = false // true=Live接続開始
let doEnd : boolean = false // true=Live接続解除
let inLive : 0 | 1 | 2 | -1 = 0 // 0=ライブ待ち,1=ライブ中,2=ライブ終了,-1=エラー
let inRcon : 0 | 1 | 2 = 0 // 0=未接続,1=接続済み,2=認証済み
let g_live_info : string = "" // Youtube ライブの状況（表示用）
let g_live_url : string = "" // 最後のライブ配信のURL
let g_live_title : string = "" // 最後のライブ配信のタイトル
function MakeLiveAnchor() : string
{
  return "<a href='" + g_live_url + "' target=new>" + g_live_title +"</a>"
}

// 参加希望者リスト
let aps : ApArray = new Array<Applicants>

function ApArray_findIndex(name: string) : number
{
  return aps.findIndex(function(value: Applicants, index: number, obj: Applicants[]): boolean { return (value.name === name) }, name)
}

function ApArray_findIndexById(id: string) : number
{
  return aps.findIndex(function(value: Applicants, index: number, obj: Applicants[]): boolean { return (value.id === id) }, id)
}

function ApArray_add(a : Applicants) : void
{
  if (a.id.length == 0 || a.name.length == 0 || !a.id.match(/[0-9A-Za-z._]+/)) {
    a.id = KEYWORD_FAILED
    a.memo = KEYWORD_FAILED_MEMO
  }
  let idx : number = ApArray_findIndex(a.name)
  if (idx < 0) {
    console.log("追加[" + aps.length + "] { id: " + a.id + ", name: " + a.name + ", memo: " + a.memo + ", accept: " + a.accept + ", nicked: " + a.nicked + "}")
    aps.push(a) // 追加
  } else {
    a.accept = aps[idx].accept // 状態を引き継ぐ
    a.nicked = aps[idx].nicked // 状態を引き継ぐ
    console.log("更新[" + idx + "] { id: " + a.id + ", name: " + a.name + ", memo: " + a.memo + ", accept: " + a.accept + ", nicked: " + a.nicked + "}")
    aps[idx] = a // 更新
    console.log(a)
  }
}

function ApArray_delete(name: string) : boolean
{
  let idx : number = ApArray_findIndex(name)
  if (idx >= 0) {
    aps.splice(idx, 1) // idx位置から1個削除
    return true
  }
  return false
}

function ApArray_clear() : void
{
  aps = []
}

/*
function WelcomeInit()
{
  if (rcon && inRcon > 1) {
    KnockServer()
    // ゲームから抜ける度にインクリメントされる joinGame 値を宣言
    rcon.send('scoreboard objectives add joinGame minecraft.custom:minecraft.leave_game')
  }
}

function WelcomeCheck()
{
  if (rcon && inRcon > 1) {
    KnockServer()
    // すべてのプレイヤーの joinGame に 0 を加える事で、新規参加者に、joinGame 値を持たせる
    rcon.send('scoreboard players add @a joinGame 0').then((result:string)=>{
      if (result.startsWith("Unknown scoreboard objective")) WelcomeInit() // ２回目から有効
    })
    // 現時点で、joinGame が 0 のプレイヤー（初参加者）を強制 KICK します。サーバーから落とされた事で、joinGame が 1 になります
    rcon.send('kick @a[scores={joinGame=0}] 配信の概要欄を良く読んで、事前に承諾をもらってください。２度目はBANです。')
    // 現時点で、joinGame が 1 のプレイヤー（２回目の参加者）を強制 BAN します。サーバーから落とされた事で、joinGame が 2 になります
    rcon.send('ban @a[scores={joinGame=1}] 承諾が得られませんでした。')
    // 現時点で、joinGame が 0 のプレイヤー（初参加者）を 1 に変更します（意味がないので、削除していいかも。要確認。）
    rcon.send('scoreboard players set @a[scores={joinGame=0}] joinGame 1')
    // 現時点で、joinGame が 3 以上のプレイヤー（初参加者）を 2 に戻します
    rcon.send('scoreboard players set @a[scores={joinGame=3..}] joinGame 2')
  }
}
*/

function WelcomeClear()
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

function WelcomeNick(id: string, nick: string) : boolean
{
  if (rcon && inRcon > 1) {
    KnockServer()
    // Youtube名：🌈RAINBOW PEGASUS🦄（HN:PEGASUS）
    // 絵文字除去：RAINBOW PEGASUS（HN:PEGASUS）
    let new_nick = RemoveEmoji(nick)
    if (new_nick.length > 0) nick = new_nick // 絵文字だけの場合、削除しない
    // 空白と記号以降は除去：RAINBOW
    let new_nicks = nick.split(/[ !-/:-?[-^`{-~　！-／：-？［-＾‘｛-｝「」【】《》]/u)
    for (let n of new_nicks) {
      if (n.length >= 0) {
        nick = n
        break
      }
    }
    // 半角→全角：ＲＡＩＮＢＯＷ
    nick = Hankaku2Zenkaku(nick)
    // １６文字まで
    const MAX_NICK_LENGTH : number = 16
    if (nick.length > MAX_NICK_LENGTH) nick = nick.slice(0, MAX_NICK_LENGTH)
    // コマンド文字列：setothernick <id> <nick>
    let command : string = 'setothernick ' + id + ' ' + nick
    console.log(command)
    rcon.send(command)
    return true
  }
  return false
}

// 転送開始時
function onStart()
{
  console.log('onStart()')
  if (rcon && inRcon > 1) {
    KnockServer()
    rcon.send('title @a subtitle "開始"')
    rcon.send('title @a title "配信コメント転送"')
    rcon.send('tellraw @a {"text":"<配信コメント転送開始>","color":"red"}')
    if (RCON_SEND_ON_LIVE_START !== "") {
      rcon.send(RCON_SEND_ON_LIVE_START)
      console.log("RCON_SEND_ON_LIVE_START: " + RCON_SEND_ON_LIVE_START)
    }
  }
}

// 転送終了時
function onEnd()
{
  console.log('onEnd()')
  if (rcon && inRcon > 1) {
    KnockServer()
    rcon.send('title @a subtitle "終了"')
    rcon.send('title @a title "配信コメント転送"')
    rcon.send('tellraw @a {"text":"<配信コメント転送終了>","color":"red"}')
    if (RCON_SEND_ON_LIVE_END !== "") {
      rcon.send(RCON_SEND_ON_LIVE_END)
      console.log("RCON_SEND_ON_LIVE_END: " + RCON_SEND_ON_LIVE_END)
    }
  }
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
}

// チャットの転送
function onChat(name: string, text: string)
{
  if (rcon && inRcon > 1) {
    KnockServer()
    var id = JSON.stringify('<' + name + '> ')
    var msg = JSON.stringify(text)
    const cmd : string = 'tellraw @a ["",{"color":"' + MC_YOUTUBE_NAME_COLOR + '","text":' + id + '},{"color":"white","text":' + msg + '}]'
    rcon.send(cmd)
  }
  const param : string = '<' + name + '> ' + text
  console.log(param)
}

// チャットのチェック
function onChatCheck(name: string, text: string)
{
  if (KEYWORD_CANCEL && text.match(RegExp(KEYWORD_CANCEL))) {
    ApArray_delete(name)
  } else if (text.match(RegExp(KEYWORD))) {
    const matcher : string = KEYWORD + "[\\s　、。・／/％%:：]*([\\w\\.]+)[\\s　＠@・／/]*(.*)$"
    let result : RegExpMatchArray | null = text.match(RegExp(matcher))
    let id : string = result && result.length > 3 ? filterPlayerID(result[2]): ""
    if (result && result.length > 3 && id.length > 0) {
      let a : Applicants = { id: id, name: name, memo: result[3], accept: 0, nicked: false}
      ApArray_add(a)
    } else if (KEYWORD_FAILED) {
      result = text.match(RegExp(KEYWORD))
      if (result) {
        ApArray_add({id: KEYWORD_FAILED, name: name, memo: KEYWORD_FAILED_MEMO, accept: 0, nicked: false})
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
          }
        })
      }
    }
  }
}

rcon.on("connect", () => {
  console.log("<rcon> connected")
  inRcon = 1
})

rcon.on("authenticated", () => {
  console.log("<rcon> authenticated")
  inRcon = 2
})

rcon.on("end", () => {
  console.log("<rcon> end")
  inRcon = 0
  if (doLoop) {
    doEnd = true
  }
})

rcon.on("error", () => {
  console.log("<rcon> error")
  inRcon = 0
  if (doLoop) {
    doEnd = true
  }
})



function onLiveStart(liveId : string) : void
{
  /* Your code here! */
  let live = JSON.parse(liveId)
  g_live_url = "https://www.youtube.com/watch?v=" + live.id
  g_live_title = live.title
  console.log("<開始> " + live.title)
  g_live_info = MakeLiveAnchor()
  inLive = 1
  onStart()
}

function onLiveEnd(reason? : string | undefined) : void
{
  /* Your code here! */
  if (doStart) return // 再接続要求中のため終了処理は行わない
  console.log("<終了> reason:" + reason)
  inLive = 2
  g_live_info = (reason == undefined ? '' : '：' + reason) + "　" + MakeLiveAnchor()
  doEnd = true
  onEnd()
}

function onLiveChat(c : any) : void
{
  /* Your code here! */
  let text = ""
  c.message.forEach(function(e : any) {
    if ( typeof(e) === "object" && 'text' in e) {
      text += e.text
    }
  })
  onChat(c.author.name, text)
  onChatCheck(c.author.name, text)
}

function onLiveError(err : unknown) : void
{
  /* Your code here! */
  inLive = -1
  if (Axios.isAxiosError(err) && err.response) {
    if (err.response.status == 503) {
      inLive = 0
      console.log("!!! Youtube Server BUSY !!!")
      g_live_info = "Youtube Server BUSY"
      if (liveChat) {
        liveChat.stop(g_live_info)
        liveChat = null
      }
      doStart = true	// 再接続要求
      return
    } else {
      console.log(err.response)
      g_live_info = "HTTP Error:" + err.response.status
    }
  } else if (err instanceof Error) {
    console.log(err.message)
    let result : RegExpMatchArray | null = err.message.match(/^Live Stream was finished\.\s*(.*)/)
    if (result) {
      const reason : string = result.length > 1 ? result[1] : ''
      inLive = 2
      g_live_info = "<a href='" + g_live_url + "' target=new>ライブ</a>は終了しました (" + reason + ")"
      if (LIVE_END_TO_CLEAR_ACCEPT === "true") WelcomeClear()
      doEnd = true
      return
    } else {
      g_live_info = "Error:" + err.message
    }
  } else {
    console.log(err)
    g_live_info = "Error: Internal"
  }
  onError()
}

function installEmitter(lc : LiveChat) : void
{
  // Emit at start of observation chat.
  // liveId: string
  lc.on("start", onLiveStart)

  // Emit at end of observation chat.
  // reason: string?
  lc.on("end", onLiveEnd)

  // Emit at receive chat.
  // chat: ChatItem
  lc.on("chat", onLiveChat)

  // Emit when an error occurs
  // err: Error or any
  lc.on("error", onLiveError)
}


//GETリクエストの設定
//'/'でアクセスされた時に、JSONとログを出力するようにする
app.get('/start', (req : express.Request, res : express.Response) => {
  console.log('startのGETリクエストを受け取りました')
  if (req.query && req.query.live_id != undefined && typeof(req.query.live_id) === 'string') {
    LIVE_ID = req.query.live_id // ライブID指定 (?live_id=xxxxxxxxxx)
  }
  g_live_info = "ライブ確認中" + (LIVE_ID.length > 0 ? "：" + LIVE_ID : "")
  console.log(g_live_info)
  res.json({ "request": "start", "rcon": inRcon, "live": inLive, "live_info": g_live_info})
  res.end()
  doStart = true
})

app.get('/stop', (req : express.Request, res : express.Response) => {
  console.log('stopのGETリクエストを受け取りました')
  g_live_info = "停止中"
  res.json({ "request": "stop", "rcon": inRcon, "live": inLive, "live_info": g_live_info})
  res.end()
  doEnd = true
})

app.get('/status', (req : express.Request, res : express.Response) => {
  try {
    for (let i = 0; i < aps.length; i++) {
      if (!aps[i].nicked) {
        // 未ログイン
        const id: string = aps[i].id.replace(/^\./, "__bedrock__")
        const cmd: string = "yq '.players." + id + ".flag' /data/plugins/NickAfkPartyPack/nicknames.yml"
        console.log(cmd)
        ExecCommand(cmd).then((flag : string) => {
          if (flag.length > 0) {
            flag = flag.trimEnd()
            console.log(flag)
            if (flag == "1") {
              const BE : boolean = (aps[i].id.charAt(0) == '.')
              aps[i].memo = !BE ? "[OK] Java版" : "[OK] 統合版"
              aps[i].accept = BE ? 2 : 1
              aps[i].nicked = true
            }
          }
        })
      }
    }
  } catch (e) {
    console.log(e)
  }

  res.json({ "request": "status", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "aps": aps })
  //console.log('statusのGETリクエストを受け取りました')
  res.end()
  //WelcomeCheck() // 定期的にログインチェックする
})

app.get('/clear', (req : express.Request, res : express.Response) => {
  console.log('clearのGETリクエストを受け取りました')
  ApArray_clear() // 参加希望者リストを空にする
  res.json({ "request": "clear", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "aps": aps })
  res.end()
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
      rcon.send('delothernick ' + aps[i].id)
      rcon.send('kick ' + aps[i].id + ' すべての参加申請をリセットしました。')
    }
  }
  res.json({ "request": "reset", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "aps": aps })
  res.end()
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
  res.json({ "request": "add", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "aps": aps })
  res.end()
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
        rcon.send('delothernick ' + id)
        rcon.send('kick ' + id + ' 参加申請を却下しました。')
      }
      result = ApArray_delete(name)
    }
  }
  res.json({ "request": "delete", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "result": result, "aps": aps })
  res.end()
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
      result = WelcomeNick(id, aps[idx].name)
    }
  }
  res.json({ "request": "accept", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "result": result, "aps": aps })
  res.end()
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
        rcon.send('delothernick ' + id)
        rcon.send('kick ' + id)
      }
      result = true
    }
  }
  res.json({ "request": "deny", "rcon": inRcon, "live": inLive, "live_info": g_live_info, "result": result, "aps": aps })
  res.end()
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

async function loop(bAutoStart : boolean)
{
  console.log("yc2mc service start")
  doLoop = true
  doStart = bAutoStart  // 自動開始
  doEnd = false

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

  if (!doStart) console.log("開始待機")
  while (doLoop) {
    if (doStart) {
      doStart = false
      if (liveChat) {
        liveChat.stop("開始要求を受け取りました。")
        await sleep(1000)
      }
      liveChat = new LiveChat(LIVE_ID ? {liveId: LIVE_ID} : ( CHANNEL_ID.startsWith("@") ? {handle: CHANNEL_ID} : {channelId: CHANNEL_ID}))
      if (liveChat) {
        installEmitter(liveChat)
        liveChat.start()
      }
    } else if (doEnd) {
      doEnd = false
      if (liveChat) {
        liveChat.stop("終了要求を受け取りました。")
        liveChat = null
      }
      doLoop = false
    }
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

var bMainLoop: boolean = true

async function closeGracefully(signal : string)
{
  console.log(`*^!@4=> Received signal to terminate: ${signal}`)

  try {
    bMainLoop = false
    if (liveChat) {
      liveChat.stop("Close Gracefully")
      liveChat = null
    }
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
