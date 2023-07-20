const { Server } = require("socket.io");
let io = null



var adminCurrentSessionSocketList = {}



const socketListen = async (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Change this to the appropriate origin(s) you want to allow
            methods: ["GET", "POST"] // Specify the HTTP methods you want to allow
        }
    });

    io.on('connection', (socket) => {
        console.log("Connected")
        if (Object.keys(adminCurrentSessionSocketList).length == 0) {
            adminCurrentSessionSocketList['somekey'] = [socket]

        } else {
            adminCurrentSessionSocketList['somekey'].push(socket);
        }
        socket.on("disconnect", () => {
            adminCurrentSessionSocketList['somekey'] = adminCurrentSessionSocketList['somekey'].filter(s => s.id != socket.id);
            // console.log(adminCurrentSessionSocketList['somekey'].length);
        });
        // console.log(adminCurrentSessionSocketList['somekey'].length);
        // console.log('connected');
    });
}

module.exports = { socketListen }
