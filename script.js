const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const ICE_SERVERS_STORAGE_KEY = 'webrtc-demo-ice-servers';

let localConnection;
let localStream;
let remoteStream;
let dataChannel;
let localIceCandidates = [];
let role = null; // 'caller' | 'callee'
let isAudioMuted = false;
let isVideoMuted = false;
let unreadCount = 0;
let modalMinimized = false;

// --- DOM refs ---
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');

const videoStage = document.getElementById('videoStage');
const stagePlaceholder = document.getElementById('stagePlaceholder');
const failurePanel = document.getElementById('failurePanel');
const retryButton = document.getElementById('retryButton');
const openAdvancedFromFailure = document.getElementById('openAdvancedFromFailure');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const muteButton = document.getElementById('muteButton');
const videoButton = document.getElementById('videoButton');
const hangupButton = document.getElementById('hangupButton');

const chatSidebar = document.getElementById('chatSidebar');
const chatToggleButton = document.getElementById('chatToggleButton');
const closeChatButton = document.getElementById('closeChatButton');
const unreadBadge = document.getElementById('unreadBadge');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesList = document.getElementById('messages');
const chatEmpty = document.getElementById('chatEmpty');
const chatDisconnectBanner = document.getElementById('chatDisconnectBanner');

const setupModal = document.getElementById('setupModal');
const minimizeModalButton = document.getElementById('minimizeModalButton');
const stepIndicator = document.getElementById('stepIndicator');
const stepRole = document.getElementById('stepRole');
const stepStart = document.getElementById('stepStart');
const stepJoin = document.getElementById('stepJoin');
const stepAnswer = document.getElementById('stepAnswer');
const startCallCard = document.getElementById('startCallCard');
const joinCallCard = document.getElementById('joinCallCard');
const backFromStartButton = document.getElementById('backFromStartButton');
const backFromJoinButton = document.getElementById('backFromJoinButton');

const localDescriptionTextarea = document.getElementById('localDescription');
const copyOfferButton = document.getElementById('copyOfferButton');
const copyOfferStatus = document.getElementById('copyOfferStatus');
const answerInput = document.getElementById('answerInput');
const answerError = document.getElementById('answerError');
const connectAsCallerButton = document.getElementById('connectAsCallerButton');

const offerInput = document.getElementById('offerInput');
const offerError = document.getElementById('offerError');
const connectAsCalleeButton = document.getElementById('connectAsCalleeButton');

const answerOutput = document.getElementById('answerOutput');
const copyAnswerButton = document.getElementById('copyAnswerButton');
const copyAnswerStatus = document.getElementById('copyAnswerStatus');

const advancedDetails = document.getElementById('advancedDetails');
const iceServersInput = document.getElementById('iceServersInput');
const iceServersError = document.getElementById('iceServersError');
const saveIceServersButton = document.getElementById('saveIceServersButton');
const saveIceServersStatus = document.getElementById('saveIceServersStatus');

const toastContainer = document.getElementById('toastContainer');

// --- Toasts ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// --- ICE servers (Advanced settings) ---
function loadIceServers() {
    const raw = localStorage.getItem(ICE_SERVERS_STORAGE_KEY);
    if (!raw) return DEFAULT_ICE_SERVERS;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
        // fall through to default
    }
    return DEFAULT_ICE_SERVERS;
}

iceServersInput.value = localStorage.getItem(ICE_SERVERS_STORAGE_KEY) || '';

saveIceServersButton.addEventListener('click', () => {
    const value = iceServersInput.value.trim();
    iceServersError.hidden = true;
    if (!value) {
        localStorage.removeItem(ICE_SERVERS_STORAGE_KEY);
        saveIceServersStatus.textContent = 'Reverted to default STUN server';
        return;
    }
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) throw new Error('Must be an array');
        const badEntry = parsed.some((entry) => !entry || typeof entry !== 'object' || typeof entry.urls !== 'string' && !Array.isArray(entry.urls));
        if (badEntry) throw new Error('Each entry needs a urls field');
        localStorage.setItem(ICE_SERVERS_STORAGE_KEY, value);
        saveIceServersStatus.textContent = 'Saved — used on next connection';
    } catch (e) {
        iceServersError.textContent = 'Invalid JSON — expecting an array of ICE server objects, each with a "urls" field';
        iceServersError.hidden = false;
    }
});

// --- Modal step management ---
function showStep(step) {
    stepRole.hidden = true;
    stepStart.hidden = true;
    stepJoin.hidden = true;
    stepAnswer.hidden = true;
    step.hidden = false;

    if (step === stepRole) stepIndicator.textContent = 'Step 1 of 3';
    else if (step === stepStart || step === stepJoin) stepIndicator.textContent = 'Step 2 of 3';
    else if (step === stepAnswer) stepIndicator.textContent = 'Step 3 of 3';
}

function openModal() {
    setupModal.hidden = false;
    modalMinimized = false;
}

function closeModal() {
    setupModal.hidden = true;
}

function resetModal() {
    role = null;
    localDescriptionTextarea.value = '';
    answerInput.value = '';
    offerInput.value = '';
    answerOutput.value = '';
    answerError.hidden = true;
    offerError.hidden = true;
    connectAsCallerButton.disabled = true;
    connectAsCalleeButton.disabled = true;
    copyOfferStatus.textContent = '';
    copyAnswerStatus.textContent = '';
    showStep(stepRole);
    openModal();
}

minimizeModalButton.addEventListener('click', () => {
    setupModal.hidden = true;
    modalMinimized = true;
});

startCallCard.addEventListener('click', async () => {
    role = 'caller';
    showStep(stepStart);
    startCallCard.disabled = true;
    joinCallCard.disabled = true;
    try {
        await createConnection(true);
    } catch (e) {
        console.error(e);
        showToast(e.message === 'No connection candidates were gathered'
            ? "Couldn't gather connection candidates — check your network and retry"
            : 'Could not start the call', 'error');
        teardownConnection();
        resetModal();
    } finally {
        startCallCard.disabled = false;
        joinCallCard.disabled = false;
    }
});

joinCallCard.addEventListener('click', () => {
    role = 'callee';
    showStep(stepJoin);
});

backFromStartButton.addEventListener('click', () => {
    teardownConnection();
    resetModal();
});

backFromJoinButton.addEventListener('click', () => {
    resetModal();
});

// --- Structural + semantic validation ---
function parseSignalingCode(raw) {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return { error: "This doesn't look like a valid code — paste the full code you received." };
    }
    if (!data || typeof data !== 'object' ||
        !data.sessionDescription || typeof data.sessionDescription !== 'object' ||
        typeof data.sessionDescription.sdp !== 'string' || !data.sessionDescription.sdp ||
        typeof data.sessionDescription.type !== 'string' ||
        !Array.isArray(data.iceCandidates)) {
        return { error: "This doesn't look like a valid code — paste the full code you received." };
    }
    return { data };
}

offerInput.addEventListener('input', () => {
    offerError.hidden = true;
    connectAsCalleeButton.disabled = !offerInput.value.trim();
});

answerInput.addEventListener('input', () => {
    answerError.hidden = true;
    connectAsCallerButton.disabled = !answerInput.value.trim();
});

connectAsCalleeButton.addEventListener('click', async () => {
    const { data, error } = parseSignalingCode(offerInput.value.trim());
    if (error) {
        offerError.textContent = error;
        offerError.hidden = false;
        return;
    }
    if (data.sessionDescription.type !== 'offer') {
        offerError.textContent = 'This is an answer code, but you chose Join — you need the caller\'s offer code.';
        offerError.hidden = false;
        return;
    }

    connectAsCalleeButton.disabled = true;
    connectAsCalleeButton.innerHTML = '<span class="btn-spinner"></span>Connecting…';
    try {
        await createConnection(false);
        await localConnection.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
        await addRemoteIceCandidates(data.iceCandidates);

        const answer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(answer);
        await waitForIceGathering();

        answerOutput.value = JSON.stringify({
            sessionDescription: localConnection.localDescription,
            iceCandidates: localIceCandidates
        });
        showStep(stepAnswer);
    } catch (e) {
        console.error(e);
        if (e.message === 'No connection candidates were gathered') {
            showToast("Couldn't gather connection candidates — check your network and retry", 'error');
        } else {
            offerError.textContent = 'Could not connect with that offer code. ' + (e.message || '');
            offerError.hidden = false;
        }
        teardownConnection();
    } finally {
        connectAsCalleeButton.disabled = false;
        connectAsCalleeButton.textContent = 'Connect';
    }
});

connectAsCallerButton.addEventListener('click', async () => {
    const { data, error } = parseSignalingCode(answerInput.value.trim());
    if (error) {
        answerError.textContent = error;
        answerError.hidden = false;
        return;
    }
    if (data.sessionDescription.type !== 'answer') {
        answerError.textContent = 'This is an offer code — paste the answer the other person sent back.';
        answerError.hidden = false;
        return;
    }
    if (localConnection && localConnection.localDescription &&
        data.sessionDescription.sdp === localConnection.localDescription.sdp) {
        answerError.textContent = 'This is your own code — paste the one you received.';
        answerError.hidden = false;
        return;
    }

    connectAsCallerButton.disabled = true;
    connectAsCallerButton.innerHTML = '<span class="btn-spinner"></span>Connecting…';
    try {
        await localConnection.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
        await addRemoteIceCandidates(data.iceCandidates);
    } catch (e) {
        console.error(e);
        answerError.textContent = 'Could not connect with that answer code. ' + (e.message || '');
        answerError.hidden = false;
        teardownConnection();
        connectAsCallerButton.disabled = false;
        connectAsCallerButton.textContent = 'Connect';
    }
});

async function addRemoteIceCandidates(candidates) {
    for (const candidate of candidates) {
        try {
            await localConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }
}

// --- Copy buttons ---
async function copyToClipboard(text, statusEl) {
    try {
        await navigator.clipboard.writeText(text);
        statusEl.textContent = 'Copied ✓';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
    } catch (e) {
        statusEl.textContent = 'Could not copy — select and copy manually';
    }
}

copyOfferButton.addEventListener('click', () => copyToClipboard(localDescriptionTextarea.value, copyOfferStatus));
copyAnswerButton.addEventListener('click', () => copyToClipboard(answerOutput.value, copyAnswerStatus));

// --- Status pill ---
function setStatus(state, label) {
    statusPill.dataset.state = state;
    statusText.textContent = label;
}

// --- Failure panel ---
function showFailurePanel() {
    failurePanel.hidden = false;
}

function hideFailurePanel() {
    failurePanel.hidden = true;
}

retryButton.addEventListener('click', () => {
    hideFailurePanel();
    teardownConnection();
    resetModal();
});

openAdvancedFromFailure.addEventListener('click', () => {
    hideFailurePanel();
    resetModal();
    advancedDetails.open = true;
});

// --- Mute / video toggles ---
muteButton.addEventListener('click', () => {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioMuted;
    });
    muteButton.setAttribute('aria-label', isAudioMuted ? 'Unmute microphone' : 'Mute microphone');
    muteButton.setAttribute('aria-pressed', String(isAudioMuted));
});

videoButton.addEventListener('click', () => {
    if (!localStream) return;
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoMuted;
    });
    videoButton.setAttribute('aria-label', isVideoMuted ? 'Turn on camera' : 'Turn off camera');
    videoButton.setAttribute('aria-pressed', String(isVideoMuted));
});

// --- Chat ---
function setChatOpen(open) {
    chatSidebar.hidden = !open;
    chatToggleButton.setAttribute('aria-pressed', String(open));
    if (open) {
        unreadCount = 0;
        unreadBadge.hidden = true;
        unreadBadge.textContent = '0';
    }
}

chatToggleButton.addEventListener('click', () => setChatOpen(chatSidebar.hidden));
closeChatButton.addEventListener('click', () => setChatOpen(false));

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function appendMessage(text, own) {
    chatEmpty.remove();
    const li = document.createElement('li');
    li.className = `bubble ${own ? 'own' : 'remote'}`;
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'bubble-time';
    timeSpan.textContent = formatTime(new Date());
    li.appendChild(textSpan);
    li.appendChild(timeSpan);
    messagesList.appendChild(li);

    const nearBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 100;
    if (nearBottom || own) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }

    if (!own && chatSidebar.hidden) {
        unreadCount += 1;
        unreadBadge.hidden = false;
        unreadBadge.textContent = String(unreadCount);
    }
}

function sendMessage() {
    const message = messageInput.value;
    if (!message) return;
    if (!dataChannel || dataChannel.readyState !== 'open') {
        chatDisconnectBanner.hidden = false;
        return;
    }
    dataChannel.send(message);
    appendMessage(message, true);
    messageInput.value = '';
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- Hang up ---
hangupButton.addEventListener('click', () => {
    teardownConnection();
    resetModal();
    showToast('Call ended', 'success');
});

function teardownConnection() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (localConnection) {
        localConnection.close();
        localConnection = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    remoteStream = null;
    localIceCandidates = [];
    stagePlaceholder.hidden = false;
    hideFailurePanel();
    sendButton.disabled = true;
    messageInput.disabled = true;
    messageInput.placeholder = 'Connect to start chatting';
    chatDisconnectBanner.hidden = true;
    setStatus('new', 'Disconnected');
}

// --- Connection creation ---
async function createConnection(createOffer) {
    localIceCandidates = [];

    localConnection = new RTCPeerConnection({ iceServers: loadIceServers() });

    if (createOffer) {
        dataChannel = localConnection.createDataChannel('chat');
        setupDataChannel();
    } else {
        localConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        if (err.name === 'NotAllowedError') {
            showToast('Camera/mic permission denied — allow access in your browser and retry', 'error');
        } else if (err.name === 'NotFoundError') {
            showToast('No camera or microphone found', 'error');
        } else {
            showToast('Could not access your camera and microphone', 'error');
        }
        throw err;
    }

    localStream.getTracks().forEach((track) => {
        localConnection.addTrack(track, localStream);
    });

    localConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            localIceCandidates.push(candidate);
        }
    };

    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    localConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
        stagePlaceholder.hidden = true;
    };

    localConnection.onconnectionstatechange = () => {
        const state = localConnection.connectionState;
        if (state === 'connecting') {
            setStatus('connecting', 'Connecting…');
        } else if (state === 'connected') {
            setStatus('connected', 'Connected');
            hideFailurePanel();
            if (!modalMinimized) closeModal();
        } else if (state === 'disconnected') {
            setStatus('disconnected', 'Disconnected');
        } else if (state === 'failed') {
            setStatus('failed', 'Failed');
            showFailurePanel();
        }
    };

    if (createOffer) {
        const offer = await localConnection.createOffer();
        await localConnection.setLocalDescription(offer);
        await waitForIceGathering();

        localDescriptionTextarea.value = JSON.stringify({
            sessionDescription: localConnection.localDescription,
            iceCandidates: localIceCandidates
        });
    }
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        sendButton.disabled = false;
        messageInput.disabled = false;
        messageInput.placeholder = 'Type your message here…';
        chatDisconnectBanner.hidden = true;
    };
    dataChannel.onmessage = (event) => {
        appendMessage(event.data, false);
    };
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
    };
    dataChannel.onclose = () => {
        sendButton.disabled = true;
        messageInput.disabled = true;
        chatDisconnectBanner.hidden = false;
    };
}

// --- ICE gathering with fallbacks ---
// Primary: 'complete' event. Fallback: 2s of no new candidates. Hard cap: 10s.
function waitForIceGathering() {
    return new Promise((resolve, reject) => {
        if (localConnection.iceGatheringState === 'complete') {
            if (localIceCandidates.length === 0) {
                reject(new Error('No connection candidates were gathered'));
            } else {
                resolve();
            }
            return;
        }

        let quietTimer = null;
        let settled = false;

        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(quietTimer);
            clearTimeout(hardCapTimer);
            localConnection.removeEventListener('icegatheringstatechange', onStateChange);
            localConnection.removeEventListener('icecandidate', onCandidate);
            if (localIceCandidates.length === 0) {
                reject(new Error('No connection candidates were gathered'));
            } else {
                resolve();
            }
        };

        const armQuietTimer = () => {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(finish, 2000);
        };

        const onStateChange = () => {
            if (localConnection.iceGatheringState === 'complete') finish();
        };

        const onCandidate = ({ candidate }) => {
            if (candidate) armQuietTimer();
        };

        const hardCapTimer = setTimeout(finish, 10000);

        localConnection.addEventListener('icegatheringstatechange', onStateChange);
        localConnection.addEventListener('icecandidate', onCandidate);
    });
}

// --- Init ---
resetModal();
