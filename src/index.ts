import { Context, Schema, Session, h } from 'koishi'
import path from 'path'
import { } from 'koishi-plugin-smmcat-localstorage'
import fs from 'fs'
import crypto from 'crypto'
import stream from 'node:stream'
import { FreeResult, UserApiResponse } from './type'

export const name = 'smmcat-delsetu'

export interface Config {
  detectionGoal: Array<string>;
  filter: Array<string>;
  useTempByMd5: boolean;
  deBug: boolean;
  isDel: boolean;
  isAllGoal: boolean;
  dontAsk: boolean;
  shutMouth: boolean;
  muteTime: number;
  allAsk: boolean;
  isDownload: boolean;
  downloadPath: string;
  Appid: string;
  key: string;
  useFree: boolean
  maxSEX: number
  SEX: number
  poorSEX: number
}

export const inject = ['localstorage']
export const Config: Schema<Config> = Schema.object({
  useFree: Schema.boolean().default(false).description('无appid&key，使用免费的nsfw接口 (开启后不支持filter选项)'),
  maxSEX: Schema.number().default(0.8).description('免费的nsfw接口配置： 最色评级 (允许禁言)'),
  SEX: Schema.number().default(0.7).description('免费的nsfw接口配置： 色评级'),
  poorSEX: Schema.number().default(0.6).description('免费的nsfw接口配置： 一般色评级'),
  Appid: Schema.string().description("Api-Appid [加群申请](https://qm.qq.com/q/Ghom0pXQYK)"),
  key: Schema.string().description("密钥"),
  detectionGoal: Schema.array(String).role("table").description("要检测的目标群"),
  filter: Schema.array(String).role("table").default([
    "ACGPorn",
    "ButtocksExposed",
    "WomenSexyChest",
    "WomenSexy",
    "ACGSexy",
    "SexualGoods",
    "Porn",
    "PornSum",
    "Sexy"
  ]).description("要检测的词条"),
  isAllGoal: Schema.boolean().default(false).description("监控所有群 （慎用）"),
  useTempByMd5: Schema.boolean().default(true).description("开启Md5校验缓存（节约接口调用并提高效率）"),
  dontAsk: Schema.boolean().default(true).description("处理后不做任何通知"),
  isDel: Schema.boolean().default(true).description("是否撤回"),
  shutMouth: Schema.boolean().default(true).description("是否禁言"),
  muteTime: Schema.number().default(6e4).description("禁言时长（毫秒）"),
  deBug: Schema.boolean().default(false).description("查看日志报错"),
  allAsk: Schema.boolean().default(false).description("每条图片均提示"),
  isDownload: Schema.boolean().default(false).description("违规图片自动下载到本地"),
  downloadPath: Schema.string().default("./data/delsetu/").description("图片保存位置")
})

export const usage = `
词条信息：
|输入词|描述|
|:-|:-|
|ACGPorn|动漫色情|
|ButtocksExposed|臀部暴露|
|WomenSexyChest|性感女人|
|WomenSexy|性暗示、性感|
|ACGSexy|动漫性暗示|
|SexualGoods|性用品展示|
|Porn|色情|
|PornSum|色情描写|
|Sexy|性感|
|Gamble|赌博|
|Terror|恐怖|
|WomenSexyLeg|女性性感的腿|

从 1.7 版本开始，提供免费的 nsfw 接口。供用户选择：
 
***
**nsfwjs** 免费，低效率，容易误检测

**腾讯云不良内容识别** 收费，高精度，低延迟
***

反色图插件由于作者资源刷爆，从新版本开始需要收费使用。每次调用均需携带签名。

费用预计一张 \`0.0020\` 元 
`;

export function apply(ctx: Context, config: Config) {

  const logs = {

  }

  /** 免费鉴别图片接口 */
  const freeApi = {
    async checkImgToDo(session: Session, next) {
      if (!config.isAllGoal && !config.detectionGoal.includes(session.guildId)) {
        return await next();
      }

      const img = h.select(session.elements, "img");
      if (!img.length) {
        return await next();
      }
      const imgUrl = img.map((item) => {
        return item.attrs.src;
      });

      const result = await this.auditPic(imgUrl)

      // 不良执行策略
      if (result.code) {
        config.isDel && session.bot.deleteMessage(session.channelId, session.messageId);
        config.shutMouth && session.bot.muteGuildMember(session.guildId, session.userId, config.muteTime);
        config.isDownload && !result.repeat && downloadImage(imgUrl);
      }
      const msg = result.data.filter((item) => item.msg).map((item) => item.msg).join('，')
      session.send(msg)
    },
    async auditPic(imgList: string[]) {
      try {
        const temp = { code: false, msg: '', data: [] }
        let index = 0;
        for (const img of imgList) {
          try {
            index++
            config.deBug && console.log(`检测第${index}个图`);
            let md5 = ''
            // 是否使用 md5缓存 业务
            if (config.useTempByMd5) {
              md5 = await freeTool.getPicMd5(img)
              const cache = await freeTool.checkPicRepeatDyMD5(md5)
              if (cache != null) {
                temp.data.push({ ...cache, repeat: true, msg: `[图${index}] 已经检测过，不做描述` })
                continue;
              }
            }
            const result: FreeResult = await ctx.http.post('https://tools.mgtv100.com/external/v1/pear/pornImage', { img_url: img })
            let code = false
            let msg = ''
            if (Number(result.data.data.hentai) > config.maxSEX) {
              temp.code = true
              code = true
              msg = `[图${index}] 太sao了！`
            } else if (Number(result.data.data.hentai) > config.SEX) {
              temp.code = true
              code = true
              msg = `[图${index}] 好se`
            } else if (Number(result.data.data.hentai) > config.poorSEX) {
              config.allAsk && (msg = `[图${index}] 一般`)
            } else {
              config.allAsk && (msg = `[图${index}] 健全`)
            }
            config.deBug && console.log(result.data.data);
            config.deBug && console.log(`结果:${msg}`);
            temp.data.push({ code, msg, data: result.data.data })
            // 是否使用 md5缓存 业务
            if (config.useTempByMd5) {
              freeTool.putPicMd5TempData(md5, { code, msg, data: result.data.data })
            }
            if (Number(result.data.data.hentai) > 0.8) break;
          } catch (error) {
            break;
          }
        }
        return temp
      } catch (error) {
        console.log(error);
        return { code: true, msg: '未知错误', data: [] }
      }
    }
  }



  async function downloadImage(imageUrl, upath = path.join(ctx.baseDir, config.downloadPath)) {
    if (!fs.existsSync(upath)) {
      fs.mkdirSync(upath, { recursive: true });
    }
    const timestamp = (new Date()).getTime();
    const imagePath = path.join(upath, `${timestamp}.jpg`);
    const response = await ctx.http.get(imageUrl, { responseType: "stream" });
    const writer = fs.createWriteStream(imagePath);
    const responseNodeStream = stream.Readable.fromWeb(response);
    responseNodeStream.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", () => {
        config.deBug && console.log(`下载完成，文件路径 ${imagePath}`);
        resolve;
      });
      writer.on("error", reject);
    });
  }
  function checkIsPass(dictList) {
    config.deBug && console.log(dictList.some((item) => {
      return dictMsg.includes(item.Scene);
    }));
    return dictList.some((item) => {
      return dictMsg.includes(item.Scene);
    });
  }

  const dictMsg = config.filter;
  const mapMsg = {
    "ACGPorn": "动漫色情",
    "ButtocksExposed": "臀部暴露",
    "WomenSexyChest": "性感女人",
    "WomenSexy": "性暗示、性感",
    "ACGSexy": "动漫性暗示",
    "SexualGoods": "性用品展示",
    "Porn": "色情",
    "PornSum": "色情描写",
    "Sexy": "性感",
    "Gamble": "赌博",
    "Terror": "恐怖",
    "WomenSexyLeg": "女性性感的腿"
  };
  async function checkImgToDo(session, next) {
    if (!config.isAllGoal && !config.detectionGoal.includes(session.guildId)) {
      return await next();
    }
    const img = h.select(session.elements, "img");
    if (!img.length) {
      return await next();
    }
    const imgUrl = img.map((item) => {
      return item.attrs.src;
    });
    try {
      let result = null;
      let isPass = true;
      if (imgUrl.length == 1) {
        let md5Code = "";
        let tempData = null;
        let repeat = false;
        if (config.useTempByMd5) {
          md5Code = await tool.getPicMd5(imgUrl[0]);
          tempData = tool.checkPicRepeatDyMD5(md5Code);
        }
        if (!tempData) {
          result = await ctx.http.post(`https://tools.mgtv100.com/external/v1/qcloud_content_audit`, {
            audit_type: "image",
            audit_content: imgUrl[0]
          }, {
            headers: getSignature()
          });
          config.useTempByMd5 && tool.putPicMd5TempData(md5Code, result);
        } else {
          repeat = true;
          result = tempData;
        }
        config.deBug && console.log(result);
        const label = result.data.LabelResults?.map((item) => {
          if (item.Suggestion != "Pass") {
            return { Scene: item.Scene, Score: item.Score };
          } else {
            return null;
          }
        }).filter((item) => item !== null);
        config.deBug && console.log(label);
        const type = checkIsPass(label);
        if (type || config.allAsk) {
          isPass = !type;
          await markMassage(isPass, label, session, imgUrl[0], repeat);
        }
      } else {
        let repeat = false;
        const eventList = imgUrl.map((item) => {
          return new Promise(async (resolve, reject) => {
            try {
              let md5Code = "";
              let tempData = null;
              if (config.useTempByMd5) {
                md5Code = await tool.getPicMd5(item);
                tempData = tool.checkPicRepeatDyMD5(md5Code);
              }
              if (!tempData) {
                result = await ctx.http.post(`https://tools.mgtv100.com/external/v1/qcloud_content_audit`, {
                  audit_type: "image",
                  audit_content: item
                }, {
                  headers: getSignature()
                });
                config.useTempByMd5 && tool.putPicMd5TempData(md5Code, result);
                resolve([result, item]);
              } else {
                repeat = true;
                resolve([tempData, item]);
              }
            } catch (error) {
              config.deBug && console.log(error);
              resolve({});
            }
          });
        });
        for (let i = 0; i < eventList.length; i++) {
          try {
            const res = await eventList[i];
            result = res[0];
            config.deBug && console.log("查找问题图片" + result.data.Suggestion);
            const label = result.data.LabelResults?.map((item) => {
              if (item.Suggestion != "Pass") {
                return { Scene: item.Scene, Score: item.Score };
              } else {
                return null;
              }
            }).filter((item) => item !== null);
            config.deBug && console.log(label);
            const type = checkIsPass(label);
            if (type || config.allAsk) {
              result = result;
              isPass = !type;
              config.deBug && console.log("找到问题，跳出循环");
              await markMassage(isPass, label, session, res[1], repeat);
              return;
            }
          } catch (error) {
            config.deBug && console.log(error);
          }
        }
      }
    } catch (error) {
      config.deBug && console.log(error);
    }
    async function markMassage(isPass, label, session2, imgurl, repeat) {
      if (!isPass) {
        config.isDel && session2.bot.deleteMessage(session2.channelId, session2.messageId);
        config.shutMouth && session2.bot.muteGuildMember(session2.guildId, session2.userId, config.muteTime);
        config.isDownload && !repeat && downloadImage(imgUrl);
      }
      config.deBug && console.log(JSON.stringify(label));
      !config.dontAsk && session2.send(
        h.at(session2.userId) + `状态：${isPass ? "通过" : "不通过"}
信息：` + (label.length ? label.map((item) => mapMsg[item.Scene]).join("、") : "无") + (label.length ? `
得分：` + label.map((item) => item.Score).join("、") : "")
      );
    }
  }

  ctx.on('ready', () => {
    getAppkeyResidualCredit()
  })

  /** 查询剩余额度 */
  async function getAppkeyResidualCredit() {
    const res = await ctx.http.post('https://tools.mgtv100.com/external/v1/qcloud_content_audit/search', {
      app_id: config.Appid,
      secret_key: config.key
    })
    const result: UserApiResponse = res.data
    return `当前密钥剩余可用次数：${result.available_count - result.request_count}`
  }

  function getSignature() {
    function generateHmacSha256(key2: string, data: string) {
      const hmac = crypto.createHmac("sha256", key2);
      hmac.update(data);
      const hash = hmac.digest("hex");
      return hash;
    }

    const apiId = config.Appid;
    const key = config.key;
    const time = Math.floor(+new Date() / 1e3);
    const queryKey = {
      "Api-Appid": apiId,
      "Api-Nonce-Str": "123456",
      "Api-Timestamp": time,
      "key": key
    };
    const ascllSortMap = Object.keys(queryKey).sort();
    const strKey = ascllSortMap.map((item) => {
      return `${item}=${queryKey[item]}`;
    }).join("&");
    config.deBug && console.log(strKey);
    const keyData = generateHmacSha256(key, strKey).toUpperCase();
    config.deBug && console.log(keyData);
    return {
      "Api-Appid": apiId,
      "Api-Nonce-Str": "123456",
      "Api-Timestamp": time,
      "Api-Sign": keyData
    };
  }

  const freeTool = {
    md5temp: {},
    md5Len: [],
    async getPicMd5(imageUrl) {
      const response = await ctx.http.get(imageUrl, { responseType: "arraybuffer" });
      const hash = crypto.createHash("md5");
      const buffer = hash.update(Buffer.from(response));
      return buffer.digest("hex");
    },
    /** 校验图片是否存在MD5缓存 */
    checkPicRepeatDyMD5(md5Data) {
      if (this.md5temp[md5Data]) {
        config.deBug && console.log("存在重复图片 返回缓存");
        return this.md5temp[md5Data];
      }
      return null;
    },
    /** 将返回的结果存进MD5缓存 */
    putPicMd5TempData(md5Data, result) {
      if (!this.md5temp[md5Data]) {
        config.deBug && console.log("新图 开始存入缓存");
        this.md5temp[md5Data] = result;
        this.tempFullToDelect();
        config.deBug && console.log("新图 完成存入缓存");
      }
    },
    // 超过约束的数量自动清理
    tempFullToDelect() {
      if (this.md5Len.length > 300) {
        config.deBug && console.log("缓存超过约束长度，执行清理");
        const delMd5 = this.md5Len.shift();
        delete this.md5temp[delMd5];
      }
    }
  };

  const tool = {
    md5temp: {},
    md5Len: [],
    async getPicMd5(imageUrl) {
      const response = await ctx.http.get(imageUrl, { responseType: "arraybuffer" });
      const hash = crypto.createHash("md5");
      const buffer = hash.update(Buffer.from(response));
      return buffer.digest("hex");
    },
    // 校验图片是否存在MD5缓存
    checkPicRepeatDyMD5(md5Data) {
      if (this.md5temp[md5Data]) {
        config.deBug && console.log("存在重复图片 返回缓存");
        return this.md5temp[md5Data];
      }
      return null;
    },
    // 将返回的结果存进MD5缓存
    putPicMd5TempData(md5Data, result) {
      if (!this.md5temp[md5Data]) {
        config.deBug && console.log("新图 开始存入缓存");
        this.md5temp[md5Data] = result;
        this.tempFullToDelect();
        config.deBug && console.log("新图 完成存入缓存");
      }
    },
    // 超过约束的数量自动清理
    tempFullToDelect() {
      if (this.md5Len.length > 300) {
        config.deBug && console.log("缓存超过约束长度，执行清理");
        const delMd5 = this.md5Len.shift();
        delete this.md5temp[delMd5];
      }
    }
  };

  ctx
    .command('查询额度')
    .action(async ({ session }) => {
      return await getAppkeyResidualCredit()
    })

  ctx.middleware(async (session, next) => {
    if (!session.guildId) {
      return await next();
    }
    if (config.useFree) {
      freeApi.checkImgToDo(session, next);
    } else {
      checkImgToDo(session, next);
    }
    return await next();
  });
}
