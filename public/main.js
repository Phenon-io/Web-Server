// (nw, 7/12/25)---
//const port = process.env.PORT || 3000;
// changed check priority to match server.js. Variable truthyness always needs to be checked first, 3000 is always true.
// (nw)---

// (nw)--- Pulls socket from current window URL
const socket = io(window.location.origin);

//clientside user info (GET)
async function getUsersOnline() {
    try {
        const res = await fetch(`${window.location.origin}/api/users`);
        if (!res.ok) throw new Error("Failed to fetch users");

        const data = await res.json();
        return data.usersOnline;
    } catch (err) {
        console.error("getUsersOnline failed:", err);
        return [];
    }
}

// (nw)---
// changed logic to operate off tokens per assignment 4 spec
function setToken(name) {
    const a = navigator.userAgent;
    let agent = "Firefox";
    if (a.indexOf("Safari") > 0) agent = "Safari";
    if (a.indexOf("Chrome") > 0) agent = "Chrome";
    if (a.indexOf("OPR") > 0) agent = "Opera";
    return { user: name, browser: agent };
}

async function putToken(token) {
    try {
        const res = await fetch("/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(token)
        });
        return res.ok;
    } catch (err) {
        console.error("putToken() failed:", err);
        return false;
    }
}

async function getToken() {
    try {
        const res = await fetch("/api/token");
        return await res.json();
    } catch (err) {
        console.error("getToken() failed:", err);
        return null;
    }
}

// (nw) token based ping logic
// also wrapped in a window to confirm button load before input
let userToken = null;
window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("ping-btn");
    if (!btn) {
        console.error("Ping button (#ping-btn) not found!");
        return;
    }

    let message = document.getElementById("ping-message");
    if (!message) {
        message = document.createElement("div");
        message.id = "ping-message";
        message.style.marginTop = "30px";
        message.style.fontWeight = "bold";
        message.style.color = "green";
        message.style.textAlign = "center";
        message.style.fontSize = "16px"
        btn.insertAdjacentElement("afterend", message);
    }

    userToken = setToken(crypto.randomUUID());
    btn.disabled = true;
    socket.on("connect", () => {
        console.log("Connected to server via socket:", socket.id);
        socket.emit("identify", userToken?.user || "anonymous");
    });

    // (nw) configures the app to act on polling rather than interrupt
    async function polling() {
        setInterval(async () => {
            const token = await getToken();
            if (!token) return;
            console.log("Polled token:", token);

            if (token.user !== userToken.user || token.browser !== userToken.browser) {
            console.log("Token differs, enabling ping button");
            btn.disabled = false;
            }
        }, 1000);
    }

    btn.addEventListener("click", async () => {
        btn.disabled = true;

        const users = await getUsersOnline();
        const otherUser = users.find(u => u !== userToken.user);
        if (!otherUser) return;

        // Update token and pass turn to other player
        await putToken({
            ...userToken
        });
    });

    let lastToken = null;

    setInterval(async () => {
        const usersOnline = await getUsersOnline();
        if (usersOnline.length !== 2) {
            btn.disabled = true;
            message.textContent = "Waiting for another user...";
            return;
        }

        const serverToken = await getToken();
        if (!serverToken) return;

        if (serverToken.user === userToken.user) {
            // It's my token — waiting for other to ping
            btn.disabled = true;
            message.textContent = "";
        } else {
            // Token differs — other user just pinged, enable button to reply
            btn.disabled = false;
            message.textContent = "Ping received!";
            setTimeout(() => { message.textContent = ""; }, 2000);
        }
    }, 1000);
});
