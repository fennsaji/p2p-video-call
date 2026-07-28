const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const ICE_SERVERS_STORAGE_KEY = 'webrtc-demo-ice-servers';

// Room ids live in a shared namespace on the public PeerJS broker, so they are
// prefixed and long enough that collisions with other apps are not a concern.
const ROOM_PREFIX = 'p2pmeet-';
const ROOM_CODE_LENGTH = 12;
const ROOM_CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ROOM_CODE_PATTERN = /^[a-z0-9]{6,32}$/;

let peer = null;
let mediaCall = null;
let chatConnection = null;
let localStream = null;
let roomCode = null;
let role = null; // 'host' | 'guest'
let isAudioMuted = false;
let isVideoMuted = false;
let unreadCount = 0;
let modalMinimized = false;
let idRetryUsed = false;

// --- DOM refs ---
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');

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
const stepHost = document.getElementById('stepHost');
const stepJoin = document.getElementById('stepJoin');
const startCallCard = document.getElementById('startCallCard');
const joinCallCard = document.getElementById('joinCallCard');
const backFromHostButton = document.getElementById('backFromHostButton');
const backFromJoinButton = document.getElementById('backFromJoinButton');

const inviteLinkInput = document.getElementById('inviteLink');
const copyInviteButton = document.getElementById('copyInviteButton');
const copyInviteStatus = document.getElementById('copyInviteStatus');
const hostWaiting = document.getElementById('hostWaiting');
const hostPreparing = document.getElementById('hostPreparing');

const joinHint = document.getElementById('joinHint');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeError = document.getElementById('roomCodeError');
const joinButton = document.getElementById('joinButton');

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

// --- Room codes and invite links ---
function createRoomCode() {
    const values = new Uint32Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(values);
    let code = '';
    for (const value of values) {
        code += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
    }
    return code;
}

function buildInviteLink(code) {
    return `${location.origin}${location.pathname}#${code}`;
}

// Accepts a full invite link, a bare "#code" fragment, or the code on its own.
function normalizeRoomCode(raw) {
    let value = String(raw || '').trim();
    const hashIndex = value.lastIndexOf('#');
    if (hashIndex !== -1) value = value.slice(hashIndex + 1);
    value = value.trim().toLowerCase();
    if (value.startsWith(ROOM_PREFIX)) value = value.slice(ROOM_PREFIX.length);
    return ROOM_CODE_PATTERN.test(value) ? value : null;
}

function clearUrlFragment() {
    if (location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
    }
}

// --- Modal step management ---
function showStep(step) {
    stepRole.hidden = true;
    stepHost.hidden = true;
    stepJoin.hidden = true;
    step.hidden = false;
    stepIndicator.textContent = step === stepRole ? 'Step 1 of 2' : 'Step 2 of 2';
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
    inviteLinkInput.value = '';
    roomCodeInput.value = '';
    roomCodeError.hidden = true;
    joinButton.disabled = true;
    copyInviteStatus.textContent = '';
    hostWaiting.hidden = true;
    hostPreparing.hidden = false;
    showStep(stepRole);
    openModal();
}

minimizeModalButton.addEventListener('click', () => {
    setupModal.hidden = true;
    modalMinimized = true;
});

startCallCard.addEventListener('click', () => {
    role = 'host';
    showStep(stepHost);
    startHosting();
});

joinCallCard.addEventListener('click', () => {
    role = 'guest';
    joinHint.textContent = 'Paste the invite link you were sent.';
    showStep(stepJoin);
    roomCodeInput.focus();
});

backFromHostButton.addEventListener('click', () => {
    teardownConnection();
    resetModal();
});

backFromJoinButton.addEventListener('click', () => {
    teardownConnection();
    clearUrlFragment();
    resetModal();
});

// --- Copy ---
async function copyToClipboard(text, statusEl) {
    try {
        await navigator.clipboard.writeText(text);
        statusEl.textContent = 'Copied ✓';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
    } catch (e) {
        statusEl.textContent = 'Could not copy — select and copy manually';
    }
}

copyInviteButton.addEventListener('click', () => copyToClipboard(inviteLinkInput.value, copyInviteStatus));

inviteLinkInput.addEventListener('focus', () => inviteLinkInput.select());

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
    teardownConnection();
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
    if (chatEmpty.isConnected) chatEmpty.remove();
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
    if (!chatConnection || !chatConnection.open) {
        chatDisconnectBanner.hidden = false;
        return;
    }
    chatConnection.send(message);
    appendMessage(message, true);
    messageInput.value = '';
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function setChatEnabled(enabled) {
    sendButton.disabled = !enabled;
    messageInput.disabled = !enabled;
    messageInput.placeholder = enabled ? 'Type your message here…' : 'Connect to start chatting';
    if (enabled) chatDisconnectBanner.hidden = true;
}

// --- Hang up / teardown ---
hangupButton.addEventListener('click', () => {
    teardownConnection();
    clearUrlFragment();
    resetModal();
    showToast('Call ended', 'success');
});

function teardownConnection() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (chatConnection) {
        chatConnection.close();
        chatConnection = null;
    }
    if (mediaCall) {
        mediaCall.close();
        mediaCall = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    roomCode = null;
    idRetryUsed = false;
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    stagePlaceholder.hidden = false;
    hideFailurePanel();
    setChatEnabled(false);
    chatDisconnectBanner.hidden = true;
    setStatus('new', 'Disconnected');
}

// --- Media ---
async function ensureLocalMedia() {
    if (localStream) return localStream;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
    localVideo.srcObject = localStream;
    isAudioMuted = false;
    isVideoMuted = false;
    muteButton.setAttribute('aria-pressed', 'false');
    videoButton.setAttribute('aria-pressed', 'false');
    return localStream;
}

// --- Peer wiring ---
function createPeer(id) {
    return new Peer(id, { config: { iceServers: loadIceServers() } });
}

function watchPeerConnection(call) {
    const pc = call.peerConnection;
    if (!pc) return;
    pc.addEventListener('connectionstatechange', () => {
        // A call that was replaced or hung up should not drive the UI any more.
        if (mediaCall !== call) return;
        const state = pc.connectionState;
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
    });
}

function attachMediaCall(call) {
    mediaCall = call;

    call.on('stream', (remoteStream) => {
        if (mediaCall !== call) return;
        remoteVideo.srcObject = remoteStream;
        stagePlaceholder.hidden = true;
    });

    call.on('close', () => {
        if (mediaCall !== call) return;
        setStatus('disconnected', 'Call ended');
        stagePlaceholder.hidden = false;
        remoteVideo.srcObject = null;
    });

    call.on('error', (err) => {
        console.error('Media call error', err);
        if (mediaCall !== call) return;
        showToast('The call ran into a problem', 'error');
    });

    watchPeerConnection(call);
}

function attachChatConnection(conn) {
    chatConnection = conn;

    conn.on('open', () => {
        if (chatConnection !== conn) return;
        setChatEnabled(true);
    });

    conn.on('data', (data) => {
        if (chatConnection !== conn) return;
        appendMessage(typeof data === 'string' ? data : JSON.stringify(data), false);
    });

    conn.on('close', () => {
        if (chatConnection !== conn) return;
        setChatEnabled(false);
        chatDisconnectBanner.hidden = false;
    });

    conn.on('error', (err) => {
        console.error('Chat connection error', err);
    });
}

function describePeerError(err) {
    switch (err.type) {
        case 'peer-unavailable':
            return 'Nobody is waiting at that link. Ask them to start the call again and send a fresh link.';
        case 'network':
        case 'socket-error':
        case 'socket-closed':
        case 'server-error':
            return 'Lost contact with the signalling server. Check your connection and retry.';
        case 'browser-incompatible':
            return 'This browser does not support the WebRTC features this call needs.';
        case 'invalid-id':
            return 'That invite code is not valid.';
        case 'ssl-unavailable':
            return 'The signalling server could not be reached over a secure connection.';
        default:
            return 'Something went wrong setting up the call. Retry to start over.';
    }
}

function attachPeerErrorHandlers() {
    peer.on('error', (err) => {
        console.error('Peer error', err);

        // The public broker rejects an id that is already registered — very rare
        // with random codes, but retry once with a fresh one before giving up.
        if (err.type === 'unavailable-id' && role === 'host' && !idRetryUsed) {
            idRetryUsed = true;
            startHosting();
            return;
        }

        showToast(describePeerError(err), 'error');

        if (err.type === 'peer-unavailable') {
            joinButton.disabled = false;
            joinButton.textContent = 'Join call';
            roomCodeError.textContent = describePeerError(err);
            roomCodeError.hidden = false;
            setStatus('failed', 'Not found');
            return;
        }

        setStatus('failed', 'Failed');
    });

    peer.on('disconnected', () => {
        // Signalling socket dropped. An established call keeps running, but
        // reconnect so the room can still be joined.
        if (peer && !peer.destroyed) peer.reconnect();
    });
}

// --- Host ---
async function startHosting() {
    hostPreparing.hidden = false;
    hostWaiting.hidden = true;
    setStatus('connecting', 'Preparing…');

    try {
        await ensureLocalMedia();
    } catch (e) {
        teardownConnection();
        resetModal();
        return;
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }

    roomCode = createRoomCode();
    peer = createPeer(ROOM_PREFIX + roomCode);
    attachPeerErrorHandlers();

    peer.on('open', () => {
        inviteLinkInput.value = buildInviteLink(roomCode);
        hostPreparing.hidden = true;
        hostWaiting.hidden = false;
        setStatus('connecting', 'Waiting for guest');
    });

    peer.on('call', async (call) => {
        try {
            const stream = await ensureLocalMedia();
            call.answer(stream);
            attachMediaCall(call);
            setStatus('connecting', 'Connecting…');
        } catch (e) {
            call.close();
        }
    });

    peer.on('connection', (conn) => {
        attachChatConnection(conn);
    });
}

// --- Guest ---
async function joinRoom(code) {
    roomCodeError.hidden = true;
    joinButton.disabled = true;
    joinButton.innerHTML = '<span class="btn-spinner"></span>Connecting…';
    setStatus('connecting', 'Connecting…');

    try {
        await ensureLocalMedia();
    } catch (e) {
        joinButton.disabled = false;
        joinButton.textContent = 'Join call';
        setStatus('new', 'Disconnected');
        return;
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }

    roomCode = code;
    peer = createPeer(undefined);
    attachPeerErrorHandlers();

    peer.on('open', () => {
        const hostId = ROOM_PREFIX + code;
        attachChatConnection(peer.connect(hostId));
        attachMediaCall(peer.call(hostId, localStream));
    });
}

roomCodeInput.addEventListener('input', () => {
    roomCodeError.hidden = true;
    joinButton.disabled = !roomCodeInput.value.trim();
});

roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !joinButton.disabled) joinButton.click();
});

joinButton.addEventListener('click', () => {
    const code = normalizeRoomCode(roomCodeInput.value);
    if (!code) {
        roomCodeError.textContent = "That doesn't look like an invite link — paste the whole link you were sent.";
        roomCodeError.hidden = false;
        return;
    }
    joinRoom(code);
});

// --- Init ---
resetModal();

const invitedCode = normalizeRoomCode(location.hash);
if (invitedCode) {
    role = 'guest';
    roomCodeInput.value = location.hash.slice(1);
    joinButton.disabled = false;
    joinHint.textContent = "You've been invited to a call. Join when you're ready — your camera and microphone will be requested.";
    showStep(stepJoin);
    joinButton.focus();
}
