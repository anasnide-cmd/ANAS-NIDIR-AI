// ✅ Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getFirestore, getDocs, collection, doc, updateDoc, query, where, addDoc, serverTimestamp, deleteDoc, increment, orderBy, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// ✅ Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ✅ UI Elements
const chatContainer = document.getElementById("chat-container");
const userInput = document.getElementById("user-input");
const typingIndicator = document.getElementById("typing-indicator");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const modelMenu = document.getElementById("model-menu");
const modelInput = document.getElementById("model");
const modelButton = document.getElementById("model-button");
const icon = document.getElementById("dropdown-icon");
const modelNotice = document.getElementById("model-notice");
const clearChatBtn = document.getElementById("clear-chat-btn");
const menuToggle = document.getElementById("menu-toggle");
const navMenu = document.getElementById("nav-menu");
const sendBtn = document.getElementById("send-btn");

let currentChatId = localStorage.getItem("chatId");
let chatHistory = [{ role: "system", content: "You are ANAS GPT." }];

// ✅ Load Memory
async function getUserMemory() {
  const user = auth.currentUser;
  if (!user) return "";
  const docRef = doc(db, "users", user.uid, "memory", "default");
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().text || "" : "";
}

sendBtn.addEventListener("click", () => {
  if (!userInput.disabled) sendMessage();
});
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !userInput.disabled) sendMessage();
});

loginBtn.addEventListener("click", () =>
  signInWithPopup(auth, provider).catch(err => alert("Login failed: " + err.message))
);
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    localStorage.removeItem("chatId");
    currentChatId = null;
    chatContainer.innerHTML = "";
  });
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInput.disabled = false;
    userInput.placeholder = `Hi ${user.displayName}, ask anything...`;
    if (!currentChatId) await startNewChat();
    loadModels();
    await loadChatHistory();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInput.disabled = true;
    userInput.placeholder = "Please login to use ANAS GPT";
  }
});

async function startNewChat() {
  const user = auth.currentUser;
  if (!user) return;
  const chatDoc = await addDoc(collection(db, "users", user.uid, "chats"), {
    title: "New Chat",
    createdAt: serverTimestamp()
  });
  currentChatId = chatDoc.id;
  localStorage.setItem("chatId", currentChatId);
}

async function saveMessage(text, sender) {
  const user = auth.currentUser;
  if (!user || !currentChatId) return;
  await addDoc(collection(db, "users", user.uid, "chats", currentChatId, "messages"), {
    text,
    sender,
    timestamp: serverTimestamp()
  });
}

async function loadChatHistory() {
  const user = auth.currentUser;
  if (!user || !currentChatId) return;
  const q = query(collection(db, "users", user.uid, "chats", currentChatId, "messages"), orderBy("timestamp"));
  const snapshot = await getDocs(q);
  chatContainer.innerHTML = "";
  chatHistory = [{ role: "system", content: "You are ANAS GPT." }];
  snapshot.forEach(doc => {
    const data = doc.data();
    const role = data.sender === "bot" ? "assistant" : "user";
    addMessage(data.text, data.sender, false);
    chatHistory.push({ role, content: data.text });
  });
}

function addMessage(text, sender = "user", save = true) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", sender);
  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  if (save) saveMessage(text, sender);
}

function typeBotMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "bot");
  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = "";
  wrapper.appendChild(bubble);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      bubble.textContent += text[i++];
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
      clearInterval(interval);
      saveMessage(text, "bot");
    }
  }, 20);
}

async function loadModels() {
  const q = query(collection(db, "models"), where("active", "==", true));
  const snapshot = await getDocs(q);
  modelMenu.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement("div");
    div.textContent = `${data.name}${data.selected ? " ⭐" : ""}`;
    div.className = "model-option";
    div.onclick = () => {
      modelInput.value = data.endpoint;
      document.getElementById("model-name").textContent = data.name;
      modelMenu.classList.remove("show");
      modelMenu.classList.add("hidden");
      document.querySelectorAll('.model-option').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
    };
    modelMenu.appendChild(div);
    if (data.selected && !modelInput.value) div.click();
  });
  if (!modelInput.value && modelMenu.children.length > 0) {
    modelMenu.children[0].click();
  } else if (!modelInput.value) {
    addMessage("⚠️ No AI model is available at the moment.", "bot");
  }
}

async function sendMessage() {
  const input = userInput.value.trim();
  if (!input || userInput.disabled) return;
  addMessage(input, "user");
  userInput.value = "";
  userInput.disabled = true;
  typingIndicator.classList.remove("hidden");
  let selectedModel = modelInput.value;
  if (!selectedModel) {
    const firstModelDiv = modelMenu.querySelector(".model-option");
    if (firstModelDiv) {
      firstModelDiv.click();
      selectedModel = modelInput.value;
      if (modelNotice) {
        modelNotice.textContent = `🔔 Auto-selected model: ${firstModelDiv.textContent}`;
        modelNotice.classList.add("show");
        setTimeout(() => modelNotice.classList.remove("show"), 3000);
      }
    }
  }
  const keys = await fetchActiveKeys();
  if (!keys.length) {
    typingIndicator.classList.add("hidden");
    addMessage("❌ No active API keys available.", "bot");
    userInput.disabled = false;
    return;
  }

  const memory = await getUserMemory();
  chatHistory = [
    { role: "system", content: `You are ANAS GPT. This is what you know about the user: ${memory}` },
    ...chatHistory.filter(msg => msg.role !== "system")
  ];
  chatHistory.push({ role: "user", content: input });

  for (let { id, value } of keys) {
    try {
      await new Promise(res => setTimeout(res, 300));
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: chatHistory,
          max_tokens: 1000
        })
      });
      const data = await res.json();
      typingIndicator.classList.add("hidden");
      if (!res.ok || !data?.choices?.[0]) throw new Error(data?.error?.message || "Invalid AI response.");
      const aiReply = data.choices[0].message.content || "❌ No response.";
      typeBotMessage(aiReply);
      chatHistory.push({ role: "assistant", content: aiReply });
      userInput.disabled = false;
      return;
    } catch (err) {
      console.warn(`❌ Key failed: ${value} | ${err.message}`);
      if (["quota", "token", "authorization"].some(keyword => err.message.includes(keyword))) {
        await updateDoc(doc(db, "api_keys", id), { active: false });
      } else {
        await incrementFailCount(id);
      }
    }
  }
  typingIndicator.classList.add("hidden");
  addMessage("❌ All keys failed. Try again later.", "bot");
  userInput.disabled = false;
}

async function fetchActiveKeys() {
  const snapshot = await getDocs(collection(db, "api_keys"));
  const keys = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.active && data.value && data.failCount < 3) {
      keys.push({ id: docSnap.id, value: data.value });
    }
  });
  return keys;
}

async function incrementFailCount(docId) {
  await updateDoc(doc(db, "api_keys", docId), {
    failCount: increment(1)
  });
}

clearChatBtn.addEventListener("click", () => {
  if (confirm("Padam semua chat?")) {
    clearChatHistory();
  }
});

async function clearChatHistory() {
  const user = auth.currentUser;
  if (!user || !currentChatId) return;
  const chatRef = collection(db, "users", user.uid, "chats", currentChatId, "messages");
  const snapshot = await getDocs(chatRef);
  const deletions = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletions);
  chatContainer.innerHTML = "";
  chatHistory = [{ role: "system", content: "You are ANAS GPT." }];
}

menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  navMenu.classList.toggle('show');
  navMenu.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest("#nav-menu") && !e.target.closest("#menu-toggle")) {
    navMenu.classList.remove('show');
    navMenu.classList.add('hidden');
  }
});

modelButton.addEventListener("click", () => {
  modelMenu.classList.toggle("show");
  modelMenu.classList.toggle("hidden");
  if (icon) icon.style.transform = modelMenu.classList.contains("show") ? "rotate(180deg)" : "rotate(0deg)";
});
document.addEventListener("click", (e) => {
  const isInside = e.target.closest("#model-menu") || e.target.closest("#model-button");
  if (!isInside) {
    modelMenu.classList.remove("show");
    modelMenu.classList.add("hidden");
    if (icon) icon.style.transform = "rotate(0deg)";
  }
});

function isInWebView() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return (
    ua.includes("Instagram") ||
    ua.includes("FBAN") ||
    ua.includes("FBAV") ||
    ua.includes("TikTok") ||
    ua.includes("Snapchat") ||
    ua.includes("SPCK") ||
    ua.includes("wv") || (ua.includes("Android") && !ua.includes("Chrome"))
  );
}
function openInBrowser() {
  const url = window.location.href.replace(/^https?:\/\//, '');
  const intent = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`;
  window.location.href = intent;
}
if (isInWebView()) {
  document.getElementById("webview-warning")?.classList.remove("hidden");
}

userInput.addEventListener("focus", () => {
  setTimeout(() => {
    userInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
});

// ✅ MEMORY MANAGEMENT
window.addMemory = async function () {
  const key = document.getElementById("new-memory-key").value.trim();
  const value = document.getElementById("new-memory-value").value.trim();
  const user = auth.currentUser;
  if (!user || !key || !value) return alert("❌ Key atau Value tak lengkap.");

  const memoryRef = doc(db, "users", user.uid, "memory", "default");
  const snapshot = await getDoc(memoryRef);
  const data = snapshot.exists() ? snapshot.data() : {};

  await setDoc(memoryRef, {
    ...data,
    [key]: value,
    text: Object.entries({ ...data, [key]: value }).map(([k, v]) => `${k}: ${v}`).join(", ")
  });

  document.getElementById("new-memory-key").value = "";
  document.getElementById("new-memory-value").value = "";
  loadMemoryList();
};

window.deleteMemory = async function (key) {
  const user = auth.currentUser;
  if (!user || !key) return;
  const memoryRef = doc(db, "users", user.uid, "memory", "default");
  const snapshot = await getDoc(memoryRef);
  if (!snapshot.exists()) return;

  const data = snapshot.data();
  delete data[key];
  delete data["text"];
  const updatedText = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(", ");

  await setDoc(memoryRef, { ...data, text: updatedText });
  loadMemoryList();
};

async function loadMemoryList() {
  const user = auth.currentUser;
  if (!user) return;
  const memoryRef = doc(db, "users", user.uid, "memory", "default");
  const snapshot = await getDoc(memoryRef);
  const listDiv = document.getElementById("memory-list");
  listDiv.innerHTML = "";

  if (!snapshot.exists()) {
    listDiv.innerHTML = "<p>No memory yet.</p>";
    return;
  }

  const data = snapshot.data();
  const keys = Object.keys(data).filter(k => k !== "text");
  if (!keys.length) {
    listDiv.innerHTML = "<p>No memory yet.</p>";
    return;
  }

  keys.forEach(key => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${key}</strong>: ${data[key]} <button onclick="deleteMemory('${key}')">🗑️</button>`;
    listDiv.appendChild(div);
  });
}

// ✅ Memory Tab Auto Load
function showTab(id, e) {
  document.querySelectorAll(".tab-section").forEach(t => t.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
  if (id === "memory-tab") loadMemoryList();
}


grecaptcha.ready(() => {
  grecaptcha.execute('6Lf1-24rAAAAAJjYx-lihGHh70Jl7qcGiWyUvFWR', { action: 'login' }).then(token => {
    // Hantar token ke backend
    console.log("Token reCAPTCHA:", token);
  });
});
