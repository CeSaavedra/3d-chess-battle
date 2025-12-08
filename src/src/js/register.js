const INSTANCE_IP = '100.31.30.28';
const BASE = `/api/proxy`;

const REGISTER_URL = '${BASE}/users/register';

const form = document.getElementById("register-form");
const errorBox = document.getElementById("register-error");

//  check if logged in
(function checkAlreadyLoggedIn() {
    try {
        const userJson = localStorage.getItem("user");
        if (!userJson) return;
        const user = JSON.parse(userJson);
		
		//send to account if so
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

    try {
		const res = await fetch(REGISTER_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});
		
        if (!res.ok) {
            if (res.status === 409) {
                if (errorBox) errorBox.textContent = "That Username is taken.  Please choose another.";
            } else {
                if (errorBox) errorBox.textContent = `Server error (${res.status}).`;
            }
            return;
        }

        const data = await res.json();
        console.log("Registration response:", data);

        if (!data.ok || !data.user) {
            if (errorBox) errorBox.textContent = data.message || "Registration failed.";
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




