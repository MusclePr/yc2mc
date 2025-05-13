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
