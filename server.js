const express = require('express');
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const port = process.env.PORT || 3000;
const app = express();

app.use(express.static('public'));
app.use(express.json());

const httpServer = createServer(app);

const corsOptions = {
    origin: "*"
};

app.use(cors(corsOptions));

const io = new Server(httpServer, {
    cors: corsOptions
});

const connectedUsers = new Map();

// (nw)--- added code to handle serverside userlist updates
function broadcastUserList() {
    const users = Array.from(connectedUsers.entries());

    users.forEach(([socketId, user]) => {
        io.to(socketId).emit("userUpdate", {
            usersOnline: users.map(([_, u]) => u.userId),
            isDisabled: user.isBtnDisabled,
        });
    });
}



io.on("connection", (socket) => {
    if (connectedUsers.size >= 2) {
        console.log("Sorry, your connection has been denied, there are too many users");
        socket.emit("connectionDenied", "Maximum number of users reached.");
        socket.disconnect(true);
        return;
    }

    console.log(`Socket connected: ${socket.id}`);

    socket.on("identify", (id) => {
        if (connectedUsers.size > 0) {
            setBtnState(false);
        }
        connectedUsers.set(socket.id, { userId: id, isBtnDisabled: true });
        broadcastUserList();
        socket.emit("identifySuccess"); // confirm to client
    });

    socket.on("disconnect", () => {
        const user = connectedUsers.get(socket.id);
        connectedUsers.delete(socket.id);
        console.log(`User ${user?.userId ?? "Unknown"} disconnected and removed`);
        // (nw) added logic to handle disconnections (stale token references)
        if(tokenFile === null) return;
        fs.readFile(tokenFile, "utf8", (err, data) => {
            if (!err) {
                try {
                    const token = JSON.parse(data);
                    if (token.user !== user?.userId) {
                        // If disconnecting user is NOT holding token, clear it
                        fs.unlink(tokenFile, (unlinkErr) => {
                            if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                                console.error("Failed to delete token file:", unlinkErr);
                            } else {
                                console.log("Token cleared because non-holder disconnected");
                            }
                        });
                    } else {
                        console.log("Token holder disconnected - current server token retained");
                    }
                } catch (parseErr) {
                    console.error("Error parsing token file:", parseErr);
                }
            } else if (err.code !== "ENOENT") {
                console.error("Error reading token file:", err);
            }
        });
        if (connectedUsers.size <= 1) { setBtnState(true); }
        broadcastUserList();
    });
});

// ---[ API: GET users ]---
app.get('/api/users', (req, res) => {
    const users = Array.from(connectedUsers.values()).map(user => user.userId);
    res.json({ usersOnline: users });
});

// ---[ API: GET data for ping button ]---
app.get('/api/data', (req, res) => {
    const socketId = req.query.socketId;
    const user = connectedUsers.get(socketId);
    if (!user) {
        console.warn("Warning: /api/data requested for unknown socketId:", socketId);
        return res.status(404).json({ isDisabled: true });
    }
    res.json({ isDisabled: user.isBtnDisabled });
});

// ---[ Server-side state helpers ]---
function switchBtnState() {
    for (const [socketId, user] of connectedUsers) {
        const updatedUserInfo = { ...user, isBtnDisabled: !user.isBtnDisabled };
        connectedUsers.set(socketId, updatedUserInfo);
    }
    broadcastUserList();
}

function setBtnState(state) {
    for (const [socketId, user] of connectedUsers) {
        const updatedUserInfo = { ...user, isBtnDisabled: state };
        connectedUsers.set(socketId, updatedUserInfo);
    }
    broadcastUserList();
}

// ---[ API: POST to toggle ping state ]---
app.post("/api/switchBtnState", (req, res) => {
    switchBtnState();
    res.json({ message: "Switched button states!" });
});

// ====[ TOKENS ]====
// added to conform to the specification provided by Assignment 4
const tokenFile = path.join(__dirname, "token.json");

// ---[ TokenState: PUT token ]---
app.post("/api/token", (req, res) => {
    const token = req.body;
    if (!token || !token.user || !token.browser) {
        return res.status(400).json({ message: "Invalid token format" });
    }

    fs.writeFile(tokenFile, JSON.stringify(token), (err) => {
        if (err) {
            console.error("Error writing token:", err);
            return res.status(500).json({ message: "Failed to write token" });
        }
        res.json({ message: "Token written" });
    });
});

// ---[ TokenState: GET token ]---
app.get("/api/token", (req, res) => {
    fs.readFile(tokenFile, "utf8", (err, data) => {
        if (err) {
            console.error("Error reading token:", err);
            return res.status(500).json({ message: "Failed to read token" });
        }
        try {
            const token = JSON.parse(data);
            res.json(token);
        } catch (parseErr) {
            res.status(500).json({ message: "Invalid token format" });
        }
    });
});
// ====[ END: TokenState ADDITIONS ]====

httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server is running on port: ${port}`);
});
