let localConnection;
let localStream;
let remoteStream;
let dataChannel;

const localDescriptionTextarea = document.getElementById('localDescription');
const remoteDescriptionTextarea = document.getElementById('remoteDescription');
const generateOfferButton = document.getElementById('copyLocalDescription');
const connectButton = document.getElementById('connect');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const muteButton = document.getElementById('muteButton');
const videoButton = document.getElementById('videoButton');

const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesList = document.getElementById('messages');

let localIceCandidates = [];

let isAudioMuted = false;
let isVideoMuted = false;

// Initially disable the send button until the data channel is open
sendButton.disabled = true;

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

        // Wait for ICE gathering to complete
        await waitForIceGathering();

        localDescriptionTextarea.value = JSON.stringify({
            sessionDescription: localConnection.localDescription,
            iceCandidates: localIceCandidates
        });
    }
});

// Handle Mute/Unmute Microphone
muteButton.addEventListener('click', () => {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioMuted;
    });
    muteButton.textContent = isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone';
});

// Handle Turn On/Off Video
videoButton.addEventListener('click', () => {
    if (!localStream) return;
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoMuted;
    });
    videoButton.textContent = isVideoMuted ? 'Turn On Video' : 'Turn Off Video';
});

// Send Message
sendButton.addEventListener('click', () => {
    const message = messageInput.value;
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
        appendMessage('You: ' + message);
        messageInput.value = '';
    } else {
        alert('Connection is not open or data channel is not available. Cannot send message.');
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

    // Create a new RTCPeerConnection
    localConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Using a public STUN server
    });

    // Set up data channel
    if (createOffer) {
        // This peer is the caller
        dataChannel = localConnection.createDataChannel('chat');
        setupDataChannel();
    } else {
        // This peer is the callee
        localConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }

    // Get the local media stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Could not access your camera and microphone. Please check permissions.');
        return;
    }

    // Add the local stream's tracks to the connection
    localStream.getTracks().forEach((track) => {
        localConnection.addTrack(track, localStream);
    });

    // Handle ICE Candidates
    localConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            localIceCandidates.push(candidate);
        } else {
            console.log('ICE gathering complete');
        }
    };

    // Handle Remote Stream
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    localConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    if (createOffer) {
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

// Set up the data channel event handlers
function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log('Data channel is open');
        // Enable the send button when the data channel is open
        sendButton.disabled = false;
    };
    dataChannel.onmessage = (event) => {
        console.log('Received message:', event.data);
        appendMessage('Remote: ' + event.data);
    };
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
    };
    dataChannel.onclose = () => {
        console.log('Data channel is closed');
        sendButton.disabled = true;
    };
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
