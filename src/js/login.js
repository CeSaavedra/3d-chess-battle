// placeholder
const API_BASE = "http://localhost:3000"; 

const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");

//  If already logged in, skip to account
(function checkAlreadyLoggedIn() {
    try {
        const userJson = localStorage.getItem("user");
        if (!userJson) return;

        const user = JSON.parse(userJson);
        if (user && user.userId) {

            window.location.href = "account.html"; // placeholder
        }
    } catch (e) {
        console.warn("Error reading saved user:", e);
    }
})();

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorBox) errorBox.textContent = "";

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password"); // placeholder

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim(); // placeholder

    if (!username) {
        if (errorBox) errorBox.textContent = "Please enter a username.";
        return;
    }

    try {

        const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);

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

        // Send to account/profile page
        window.location.href = "account.html"; // placeholder

    } catch (err) {
        console.error(err);
        if (errorBox) errorBox.textContent = "Unable to reach server. Is it running?";
    }
});
