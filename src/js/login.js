const INSTANCE_IP = '107.23.150.169';
const BASE = `http://${INSTANCE_IP}:3000`;

const USER_BY_NAME_URL = (username) =>
    `${BASE}/users/${encodeURIComponent(username)}`;

const USER_BY_ID_URL = (userId) =>
    `${BASE}/users/id/${encodeURIComponent(userId)}`;

const RENAME_BY_ID_URL = (userId) =>
    `${BASE}/users/id/${encodeURIComponent(userId)}/rename`;



const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");

//  If already logged in, skip to account
(function checkAlreadyLoggedIn() {
    try {
        const userJson = localStorage.getItem("user");
        if (!userJson) return;

        const user = JSON.parse(userJson);
        if (user && user.userId) {
            window.location.href = "src/pages/account.html";
        }
    } catch (e) {
        console.warn("Error reading saved user:", e);
    }
})();

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorBox) errorBox.textContent = "";

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password"); 

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim(); 

    if (!username) {
        if (errorBox) errorBox.textContent = "Please enter a username.";
        return;
    }

    try {

        const res = await fetch(USER_BY_NAME_URL(username));


        if (!res.ok) {
            if (res.status === 404) {
                if (errorBox) errorBox.textContent = "User not found. Check your username.";
            } else {
                if (errorBox) errorBox.textContent = `Server error (${res.status}).`;
            }
            return;
        }

        const data = await res.json();
        console.log("Login response:", data);

        if (!data.ok || !data.user) {
            if (errorBox) errorBox.textContent = data.message || "Login failed.";
            return;
        }

        // Save info
        localStorage.setItem("user", JSON.stringify(data.user));

        // Send to profile page
        window.location.href = "src/pages/account.html";
    } catch (err) {
        console.error(err);
        if (errorBox) errorBox.textContent = "Unable to reach server. Is it running?";
    }
});


