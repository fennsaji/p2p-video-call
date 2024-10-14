let localConnection;
let localStream;
let remoteStream;

const localDescriptionTextarea = document.getElementById('localDescription');
const remoteDescriptionTextarea = document.getElementById('remoteDescription');
const generateOfferButton = document.getElementById('copyLocalDescription');
const connectButton = document.getElementById('connect');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const muteButton = document.getElementById('muteButton');
const videoButton = document.getElementById('videoButton');

let localIceCandidates = [];

let isAudioMuted = false;
let isVideoMuted = false;

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

// Create Connection and Generate Offer
async function createConnection(createOffer = true) {
    localIceCandidates = [];

    // Get the local media stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Could not access your camera and microphone. Please check permissions.');
        return;
    }

    localConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Using a public STUN server
    });

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
