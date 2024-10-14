let localConnection;
let sendChannel;

const localDescriptionTextarea = document.getElementById('localDescription');
const remoteDescriptionTextarea = document.getElementById('remoteDescription');
const generateOfferButton = document.getElementById('copyLocalDescription');
const connectButton = document.getElementById('connect');
const sendButton = document.getElementById('sendButton');
const messageInput = document.getElementById('messageInput');
const messagesList = document.getElementById('messages');

let localIceCandidates = [];
let remoteIceCandidates = [];

// Generate Offer and Local Description
generateOfferButton.addEventListener('click', async () => {
    await createConnection();
});

// Handle Connection when Remote Description is provided
connectButton.addEventListener('click', async () => {
    const remoteData = JSON.parse(remoteDescriptionTextarea.value);

    if (!localConnection) {
        await createConnection(false); // Create connection without creating offer
    }

    await localConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sessionDescription));

    // Add Remote ICE Candidates
    for (const candidate of remoteData.iceCandidates) {
        try {
            await localConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }

    if (remoteData.sessionDescription.type === 'offer') {
        const answer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(answer);
    }

    // Wait for ICE gathering to complete
    await waitForIceGathering();

    localDescriptionTextarea.value = JSON.stringify({
        sessionDescription: localConnection.localDescription,
        iceCandidates: localIceCandidates
    });
});

// Send Message
sendButton.addEventListener('click', () => {
    const message = messageInput.value;
    if (message && sendChannel && sendChannel.readyState === 'open') {
        sendChannel.send(message);
        appendMessage('You: ' + message);
        messageInput.value = '';
    } else {
        alert('Connection is not open. Cannot send message.');
    }
});

// Append Message to Chat
function appendMessage(message) {
    const li = document.createElement('li');
    li.textContent = message;
    messagesList.appendChild(li);
}

// Create Connection and Generate Offer
async function createConnection(createOffer = true) {
    localIceCandidates = [];
    // Configuration object for ICE servers (STUN/TURN servers)
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' } // Public STUN server
        ]
    };

    // Create a new RTCPeerConnection
    localConnection = new RTCPeerConnection(configuration);

    // Handle ICE Candidates
    localConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            localIceCandidates.push(candidate);
        } else {
            console.log('ICE gathering complete');
        }
    };

    // Handle Incoming Data Channel
    localConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.onmessage = (e) => {
            appendMessage('Remote: ' + e.data);
        };
    };

    if (createOffer) {
        // Create Data Channel
        sendChannel = localConnection.createDataChannel('messagingChannel');
        sendChannel.onopen = () => console.log('Data channel is open');
        sendChannel.onmessage = (e) => {
            appendMessage('Remote: ' + e.data);
        };

        // Create Offer
        const offer = await localConnection.createOffer();
        await localConnection.setLocalDescription(offer);

        // Wait for ICE gathering to complete
        await waitForIceGathering();

        localDescriptionTextarea.value = JSON.stringify({
            sessionDescription: localConnection.localDescription,
            iceCandidates: localIceCandidates
        });
    }
}

// Wait for ICE Gathering to Complete
function waitForIceGathering() {
    return new Promise((resolve) => {
        if (localConnection.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (localConnection.iceGatheringState === 'complete') {
                    localConnection.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            localConnection.addEventListener('icegatheringstatechange', checkState);
        }
    });
}
