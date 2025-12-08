# Chess Battle 3D v0.0.0

## How to Test/Run

Run these commands in the VS Code terminal from the project root (MacOS used):

```bash
# 1. Install Express and Socket.IO (if not already)
npm install express socket.io

# 2. Create public and copy the top-level index.html into it
mkdir -p public
cp index.html public/

# 3. Create symlinks inside public that point to the src subfolders
ln -sfn ../src/css public/css
ln -sfn ../src/js public/js
ln -sfn ../src/assets public/assets
ln -sfn ../src/pages public/pages

# 4. Start your Node server
node src/js/server.js

```
IF you are using WINDOWS OS - Run these commands INSTEAD 
May need to grant admin privilege

```bash
npm install express socket.io
mkdir public
copy index.html public\

mklink /D public\css ..\src\css
mklink /D public\js ..\src\js
mklink /D public\assets ..\src\assets
mklink /D public\pages ..\src\pages

node src/js/server.js
```


Open in your browser:

- Login Page: `http://localhost:3000/index.html`

Login on the login page using:

- **username:** `frank`  
- **password:** `pword`

Multiplayer test:

- Open **two** tabs or windows to: `http://localhost:3000/pages/account.html`  
- In one tab click **Create Invite Code**, copy the code, paste it into the other tab’s **Join** field. The game will initialize when both clients connect.