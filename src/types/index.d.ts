// 参加希望者
export type Applicants = {
  id: string // マインクラフトアカウント名
  name: string // Youtube アカウント名
  memo: string // メモ
  accept: number // 0=未承認／1=Java版として承認／2=統合版として承認
  nicked: boolean // ニックネーム付与済み
}

export interface ApArray extends Array<Applicants> {
}

// チャンネル設定
export type LiveStreamConfig = {
  channelUrl: string // Youtube / Twitch のチャンネル URL
  color?: MinecraftColor // Minecraft のチャットの名前の色
  rconCommands?: {
    onStart?: string; // 配信開始時に実行したい rcon コマンド
    onEnd?: string; // 配信終了時に実行したい rcon コマンド
  }
}

export interface LiveStreamConfigArray extends Array<LiveStreamConfig> {
}

// 全体設定
export type GlobalConfig = {
  formatVersion: number
  whitelistControlEnabled: boolean
  streams: LiveStreamConfig[]
}

// ライブ情報
export type LiveStreamInfo = {
  config: LiveStreamConfig
  liveUrl: string // ライブ配信中のURL
  title: string // ライブ配信中のタイトル
  status: string // 画面に表示する状態の文字列
  inLive: 0 | 1 | 2 | -1  // ライブ状態：0=ライブ待ち,1=ライブ中,2=ライブ終了,-1=エラー
  whitelistStatus: "none" | "linked" | "linkable"
  lastSeenAliveAt: number // 最後に生存確認された時刻 (UNIXタイムスタンプ)
}

export interface LiveStreamInfoArray extends Array<LiveStreamInfo> {
}

export type MinecraftColor =
  | "black"
  | "dark_blue"
  | "dark_green"
  | "dark_aqua"
  | "dark_red"
  | "dark_purple"
  | "gold"
  | "gray"
  | "dark_gray"
  | "blue"
  | "green"
  | "aqua"
  | "red"
  | "light_purple"
  | "yellow"
  | "white"
  | `#${string}`; // カスタムカラー (16進数表記)
