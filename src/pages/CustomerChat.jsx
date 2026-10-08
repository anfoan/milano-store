import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Paperclip, Settings, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { uploadChatMedia } from '../services/uploadService';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';

const CustomerChat = () => {
    const { chatId } = useParams();
    const navigate = useNavigate();
    const { t, direction } = useLanguage();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatDetails, setChatDetails] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null); // Image Zoom State
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null); // Fix: Added missing ref

    const [showMenu, setShowMenu] = useState(false); // Menu State
    const [chatAccess, setChatAccess] = useState('checking');

    // Keep the chat available on this device without claiming shared links.
    useEffect(() => {
        document.title = t('chat.page_title');
        return () => {
            document.title = t('rate.store_title');
        };
    }, [chatId, t]);

    // Fetch Chat Details (Subject, etc.)
    useEffect(() => {
        const fetchChatDetails = async () => {
            if (!chatId) return;
            try {
                const docRef = doc(db, "contact_messages", chatId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const deviceKey = localStorage.getItem('milano_chat_device_key');
                    const activeChatId = localStorage.getItem('milano_active_chat');
                    const ownsChat = data.deviceKey === deviceKey || (!data.deviceKey && activeChatId === chatId);
                    const isClosed = data.status === 'closed' || data.status === 'closed_by_buyer';
                    if (!ownsChat || isClosed) {
                        setChatAccess('denied');
                        if (activeChatId === chatId) localStorage.removeItem('milano_active_chat');
                        navigate('/contact', { replace: true });
                        return;
                    }
                    if (!data.deviceKey && deviceKey) await updateDoc(docRef, { deviceKey });
                    localStorage.setItem('milano_active_chat', chatId);
                    setChatDetails(data);
                    setChatAccess('allowed');
                } else {
                    setChatAccess('denied');
                    navigate('/contact', { replace: true });
                }
            } catch (error) {
                console.error("Error fetching chat details:", error);
                setChatAccess('denied');
                navigate('/contact', { replace: true });
            }
        };
        fetchChatDetails();
    }, [chatId, navigate]);

    // Real-time Messages
    useEffect(() => {
        if (!chatId || chatAccess !== 'allowed') return;

        // Subcollection 'messages' within the contact_message document
        const q = query(
            collection(db, "contact_messages", chatId, "messages"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMessages(msgs);
            scrollToBottom();
        }, (error) => {
            console.error("Error fetching chat messages:", error);
        });

        return () => unsubscribe();
    }, [chatId, chatAccess]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleCloseChat = async () => {
        if (!chatId) return;
        try {
            // 1. Mark as closed in Firestore
            const docRef = doc(db, "contact_messages", chatId);
            await updateDoc(docRef, { status: 'closed' });

            // 2. Clear from localStorage
            localStorage.removeItem('milano_active_chat');

            // 3. Navigate away
            navigate('/');
        } catch (error) {
            console.error("Error closing chat:", error);
            // Even if FS fails, clear local and exit
            localStorage.removeItem('milano_active_chat');
            navigate('/');
        }
    };

    const chatMediaError = error => {
        const code = error?.message || '';
        if (code === 'CHAT_MEDIA_TYPE_NOT_ALLOWED') return direction === 'rtl'
            ? 'يسمح بإرسال الصور (JPEG، PNG، GIF، WEBP) أو الفيديوهات (MP4، WEBM، MOV) فقط.'
            : 'Only JPEG, PNG, GIF, WEBP images or MP4, WEBM, MOV videos can be sent.';
        if (code === 'CHAT_VIDEO_TOO_LARGE') return direction === 'rtl'
            ? 'حجم الفيديو كبير جداً. الحد الأقصى 30 ميجابايت.'
            : 'The video is too large. Maximum size is 30 MB.';
        if (code === 'CHAT_IMAGE_TOO_LARGE') return direction === 'rtl'
            ? 'حجم الصورة كبير جداً. الحد الأقصى 10 ميجابايت.'
            : 'The image is too large. Maximum size is 10 MB.';
        return t('chat.upload_error');
    };

    const handleFileUpload = async event => {
        const input = event.target;
        const file = input.files?.[0];
        if (!file || !chatId) { input.value = ''; return; }

        try {
            setIsUploading(true);
            const media = await uploadChatMedia(file);
            await addDoc(collection(db, 'contact_messages', chatId, 'messages'), {
                text: '',
                mediaUrl: media.url,
                mediaType: media.mediaType,
                fileName: media.name,
                fileSize: media.bytes,
                // Compatibility for older image-only message readers.
                imageUrl: media.mediaType === 'image' ? media.url : '',
                sender: 'user',
                createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'contact_messages', chatId), { status: 'new' });
        } catch (error) {
            console.error('Customer chat media upload failed:', error);
            alert(chatMediaError(error));
        } finally {
            setIsUploading(false);
            input.value = '';
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await addDoc(collection(db, "contact_messages", chatId, "messages"), {
                text: newMessage,
                sender: 'user', // 'user' or 'admin'
                createdAt: serverTimestamp(),
            });
            // Update parent doc status to new for admin notification
            await updateDoc(doc(db, "contact_messages", chatId), { status: 'new' });
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    if (chatAccess !== 'allowed') return null;

    return (
        <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#0a0a0b] flex flex-col font-['Cairo'] relative" dir={direction}>


            {/* Header */}
            <div className="bg-white dark:bg-[#1a1d23] px-4 py-3 shadow-sm flex items-center justify-between z-10 sticky top-0 border-b border-gray-100 dark:border-white/5">

                {/* Store Info (Right in RTL) */}
                {/* Store & Navigation (Right in RTL) */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 border border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl flex items-center justify-center transition-colors text-gray-400 dark:text-gray-500"
                    >
                        {direction === 'rtl' ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
                    </button>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-100 dark:border-white/10">
                            <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" onError={(e) => e.target.src = "/logo.jpg"} />
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-[#1a1d23] rounded-full"></span>
                    </div>
                    <div className={direction === 'rtl' ? 'text-right' : 'text-start'}>
                        <h2 className="font-black text-gray-800 dark:text-white text-sm leading-none mb-1">{t('rate.store_title')}</h2>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-green-400">{t('chat.active_now')}</span>
                    </div>
                </div>

                {/* Settings Menu (Left) */}
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors text-white shadow-md ${showMenu ? 'bg-red-600' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'}`}
                    >
                        {showMenu ? <X size={20} /> : <Settings size={20} />}
                    </button>

                    {/* Dropdown menu */}
                    {showMenu && (
                        <div className={`absolute top-12 w-32 bg-white dark:bg-[#1a1d23] rounded-xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden py-1 z-50 ${direction === 'rtl' ? 'left-0' : 'right-0'}`}>
                            <button
                                onClick={handleCloseChat}
                                className={`w-full px-4 py-3 text-red-500 hover:bg-red-50 font-bold text-sm transition-colors ${direction === 'rtl' ? 'text-right' : 'text-start'}`}
                            >
                                {t('chat.close')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div className="chat-dot-pattern flex-1 overflow-y-auto p-4 space-y-4 z-10">

                {/* Center Status Bubble */}
                <div className="flex justify-center mt-4 mb-8">
                    <div className="bg-blue-50/80 backdrop-blur-sm text-[#3b82f6] px-6 py-2 rounded-full text-xs font-black shadow-sm border border-blue-100/50">
                        {chatDetails?.subject || t('chat.start_conversation')}
                    </div>
                </div>

                {messages.map((msg) => {
                    const mediaUrl = msg.mediaUrl || msg.imageUrl;
                    const isVideo = msg.mediaType === 'video' || (!msg.mediaType && /\.(mp4|webm|mov)(?:[?#]|$)/i.test(mediaUrl || ''));
                    return <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === 'user' ? (direction === 'rtl' ? 'flex-row-reverse' : 'flex-row-reverse') : (direction === 'rtl' ? 'flex-row' : 'flex-row')}`}>
                        {/* Avatar Column */}
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0 mb-1">
                            <img
                                src={msg.sender === 'user' ? "/user-icon.png" : "/logo.jpg"}
                                alt={msg.sender === 'user' ? "User" : "Admin"}
                                className="w-full h-full object-cover"
                                onError={(e) => e.target.src = "/logo.jpg"}
                            />
                        </div>

                        {/* Message Bubble/Image */}
                        <div className={`max-w-[75%] shadow-sm relative transition-all ${mediaUrl ? 'p-2 rounded-2xl' : 'px-5 py-3 rounded-2xl text-sm font-bold'
                            } ${msg.sender === 'user'
                                ? 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                                : 'bg-[#3b82f6] text-white rounded-br-sm'
                            }`}>
                            {mediaUrl ? (
                                <div className="space-y-1">
                                    <div className="max-w-[250px] overflow-hidden rounded-xl border border-black/5 bg-gray-50/10">
                                        {isVideo ? (
                                            <video src={mediaUrl} controls preload="metadata" className="block max-h-[280px] w-full bg-black" />
                                        ) : (
                                            <img src={mediaUrl} alt="attached" className="w-full h-auto cursor-zoom-in hover:brightness-95 transition-all" onClick={() => setSelectedImage(mediaUrl)} />
                                        )}
                                    </div>
                                    <span className={`text-[9px] block text-left ${msg.sender === 'user' ? 'text-gray-400' : 'text-blue-100'}`}>
                                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('chat.just_now')}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <p className="relative z-10">{msg.text}</p>
                                    <span className={`text-[9px] block mt-1 ${msg.sender === 'user' ? 'text-gray-400' : 'text-blue-100'}`}>
                                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('chat.just_now')}
                                    </span>
                                </>
                            )}

                            {!mediaUrl && (
                                <div className={`absolute bottom-3 w-3 h-3 transform rotate-45 ${msg.sender === 'user'
                                    ? 'bg-white border-b border-l border-gray-100 -left-1'
                                    : 'bg-[#3b82f6] -right-1'
                                    }`} style={{ zIndex: 0 }}></div>
                            )}
                        </div>
                    </div>;
                })}

                {isUploading && (
                    <div className="flex justify-center animate-pulse py-2">
                        <span className="text-xs text-gray-400 font-bold">{t('chat.uploading')}</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white dark:bg-[#1a1d23] p-3 z-10 sticky bottom-0 border-t border-gray-100 dark:border-white/5">
                <form onSubmit={handleSendMessage} className="flex gap-2 items-center max-w-4xl mx-auto">

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileUpload}
                        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                        <Paperclip size={20} className={isUploading ? 'animate-spin text-blue-500' : ''} />
                    </button>

                    <div className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[20px] flex items-center px-4 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                        <input
                            type="text"
                            placeholder={t('chat.type_message')}
                            className="w-full bg-transparent border-none outline-none text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-bold text-sm"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="w-10 h-10 bg-[#3b82f6] hover:bg-blue-600 text-white rounded-[14px] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
                    >
                        <Send size={18} className={newMessage.trim() ? '-ml-0.5' : ''} />
                    </button>
                </form>
            </div>

            {/* Image Zoom Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
                        <img
                            src={selectedImage}
                            alt="Preview"
                            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl duration-200"
                        />
                        <button
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X size={32} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerChat;
