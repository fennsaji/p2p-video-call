# Peer-to-Peer Video Call with Messaging using WebRTC

This project is a simple peer-to-peer (P2P) video calling application with text messaging capabilities, built using WebRTC (Web Real-Time Communication). It allows two users to connect directly, share their video and audio streams, and exchange text messages without the need for a central server after the initial setup.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Setting Up the Application](#setting-up-the-application)
  - [Running the Application](#running-the-application)
- [Usage](#usage)
  - [Establishing a Connection](#establishing-a-connection)
    - [Peer A (Caller)](#peer-a-caller)
    - [Peer B (Callee)](#peer-b-callee)
    - [Completing the Connection](#completing-the-connection)

---


## Prerequisites

- **Modern Web Browser:** Latest version of Chrome, Firefox, or Edge.
- **Web Server:** Since WebRTC requires a secure context (HTTPS) or localhost, you need to serve the files using a web server. You can use:

  - **Node.js `http-server`:** Install with `npm install -g http-server`.
  - **Python SimpleHTTPServer:** Use `python -m http.server` (Python 3) or `python -m SimpleHTTPServer` (Python 2).
  - **VSCode Live Server Extension.**

- **Two Devices or Browser Windows:** To simulate the connection between two peers.

## Getting Started

### Setting Up the Application

1. **Clone or Download the Repository:**

   ```bash
   git clone https://github.com/your-username/webrtc-video-call.git
   ```

2. **Navigate to the Project Directory:**

   ```bash
   cd webrtc-video-call
   ```

3. **Ensure the Following Files are Present:**

   - `index.html`: The main HTML file containing the user interface.
   - `script.js`: The JavaScript file with the WebRTC logic.
   - Any additional CSS or asset files (if applicable).

### Running the Application

1. **Start a Local Web Server:**

   - Using **Node.js `http-server`:**

     ```bash
     http-server -c-1
     ```

   - Using **Python SimpleHTTPServer (Python 3):**

     ```bash
     python -m http.server
     ```

   - Using **VSCode Live Server:**

     - Open the project folder in VSCode.
     - Right-click on `index.html` and select **"Open with Live Server"**.

2. **Access the Application in Your Browser:**

   - Navigate to `http://localhost:8080` or the appropriate port provided by your web server.

3. **Allow Media Permissions:**

   - When prompted by the browser, allow access to your camera and microphone.

## Usage

### Establishing a Connection

#### **Peer A (Caller)**

1. **Open the Application:**

   - Access the application in your web browser.

2. **Generate Connection Offer:**

   - Click the **"Generate Connection Offer"** button.
   - Wait for the connection details to appear in the **"Your Connection Details"** textarea.
   - **Copy** the entire content of the textarea.

3. **Share Connection Details:**

   - Send the copied connection details to Peer B via email, chat, or any other method.

#### **Peer B (Callee)**

1. **Open the Application:**

   - Access the application in another browser window or on a different device.

2. **Paste Connection Details:**

   - Paste the connection details received from Peer A into the **"Remote Connection Details"** textarea.

3. **Connect:**

   - Click the **"Connect"** button.
   - Wait for your own connection details to appear in the **"Your Connection Details"** textarea.
   - **Copy** the entire content of the textarea.

4. **Share Connection Details:**

   - Send the copied connection details back to Peer A.

#### **Completing the Connection**

##### **Peer A (Caller)**

1. **Paste Connection Details:**

   - Paste the connection details received from Peer B into the **"Remote Connection Details"** textarea.

2. **Connect:**

   - Click the **"Connect"** button.
   - The peer-to-peer connection should now be established.
