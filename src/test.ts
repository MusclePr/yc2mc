// テスト
import { LiveChat } from "youtube-chat"
import Axios from 'axios'
import { log } from "node:console"
import { exit } from "node:process"

const CHANNEL_ID: string = process.env.CHANNEL_ID || ""
const LIVE_ID: string = process.env.LIVE_ID || ""

//const liveChat = new LiveChat({handle: "@AruruKingdom"})
//console.log(LIVE_ID ? {liveId: LIVE_ID} : ( CHANNEL_ID.startsWith("@") ? {handle: CHANNEL_ID} : {channelId: CHANNEL_ID}));
const liveChat = new LiveChat(LIVE_ID ? {liveId: LIVE_ID} : ( CHANNEL_ID.startsWith("@") ? {handle: CHANNEL_ID} : {channelId: CHANNEL_ID}))

var retry : number = 1;

// sleep関数
const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

liveChat.on("start", (liveId) => {
  console.log("<start> https://www.youtube.com/watch?v=" + liveId);
})

liveChat.on("end", (reason) => {
  console.log("<end>");
  retry = 0;
})

liveChat.on("chat", (c) => {
  var text : string = ""
  c.message.forEach(function(e) {
    if ( typeof(e) === "object" && 'text' in e) {
      text += e.text
    }
  })
  //console.log(c);
  const param : string = '<' + c.author.name + '> ' + text
  console.log(param)
})

liveChat.on("error", (err) => {
  if (Axios.isAxiosError(err) && err.response) {
    console.log("<error in Axios>");
    if (err.response.status == 503) {
      console.log(" status:503\n");
      liveChat.stop();
      retry = 1;
      return;
    }
    console.log(err.response);
  } else if (err instanceof Error) {
    console.log("<error message>");
    if (err.message.match(/^Live Stream was finished/)) {
      console.log(err.message)
      console.log("live is finished")
    } else {
      console.log(err.message)
    }
  } else {
    console.log("<error>");
    console.log(err)
  }
  retry = 0;
  //process.exit();
})

async function main() {
  //console.log("<pretest>\n")
  //const url = "https://www.youtube.com/@EmuKei_VTuber/live"
  //const res = await Axios.get(url, { headers: { Accept: 'text/html', 'Accept-Encoding': 'utf-8' } })
  ////console.log(res.headers)
  //console.log(res.data)
  //console.log("\n</pretest>\n")
  if (1) {
    let matcher : string = "参加希望[\\s％%:：]+(\\w+)[\\s＠@・／/]*(.*)$"
    let texts : string[] = [
     "参加希望％Muscle_p",
     "こんにちまっする。参加希望　Muscle_p＠Java",
    ]
    texts.forEach(text => {
      let result : RegExpMatchArray | null = text.match(RegExp(matcher))
      console.log(result)
    })
  }
  if (0) {
    console.log("<main>\n");
    while (retry) {
      await liveChat.start();
      await sleep(1000);
    }
    console.log("<stop>\n");
    liveChat.stop();
  }
}

async function closeGracefully(signal : string)
{
  console.log(`*^!@4=> Received signal to terminate: ${signal}`)

  liveChat.stop()
  process.exit()
}
process.on('SIGINT', closeGracefully)
process.on('SIGTERM', closeGracefully)

main().catch(console.error)
