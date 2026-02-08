import React, { useState, useRef } from 'react';
import { User, ForumPost, ForumComment, ForumCategory, IdentityOption } from '../types';
import { MessageCircle, Heart, Share2, MoreHorizontal, Image as ImageIcon, Send, ArrowLeft, PenSquare, User as UserIcon, Shield, Ghost, Filter, X, Loader2 } from 'lucide-react';

interface CommunityProps {
  user: User;
}

// Mock Data
const MOCK_POSTS: ForumPost[] = [
  {
    id: '1',
    authorId: 'u1',
    authorName: 'Tanvir Ahmed',
    authorRank: 'Chief Officer',
    identityType: 'Real Name',
    category: ForumCategory.DECK,
    title: 'Cargo Watch issues in Chittagong Anchorage',
    content: 'Has anyone else experienced excessive delays with stevedores at outer anchorage recently? We are waiting for 3 days just for a gang.',
    timestamp: Date.now() - 3600000,
    likes: 12,
    commentCount: 3,
    comments: [
      { id: 'c1', postId: '1', authorId: 'u2', authorName: 'Captain (Anon)', content: 'It is common during monsoon season.', timestamp: Date.now() - 1800000, identityType: 'Rank' }
    ]
  },
  {
    id: '2',
    authorId: 'u3',
    authorName: 'Anonymous Mariner',
    authorRank: '3rd Engineer',
    identityType: 'Anonymous',
    category: ForumCategory.AGENCY,
    title: 'Review of brave Royal Ship Management?',
    content: 'Thinking of applying. Are they paying wages on time? Any insiders?',
    timestamp: Date.now() - 86400000,
    likes: 5,
    commentCount: 1,
    comments: []
  },
  {
    id: '3',
    authorId: 'u4',
    authorName: '2nd Engineer',
    authorRank: '2nd Engineer',
    identityType: 'Rank',
    category: ForumCategory.ENGINE,
    title: 'Purifier Overhaul Tip',
    content: 'Found a great trick for the Mitsubishi purifier vertical shaft removal. Make sure to heat the housing slightly if it is stuck.',
    imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600',
    timestamp: Date.now() - 120000000,
    likes: 24,
    commentCount: 0,
    comments: []
  }
];

export const Community: React.FC<CommunityProps> = ({ user }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [posts, setPosts] = useState<ForumPost[]>(MOCK_POSTS);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Create Post State
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCategory, setNewPostCategory] = useState<ForumCategory>(ForumCategory.GENERAL);
  const [newPostIdentity, setNewPostIdentity] = useState<IdentityOption>('Real Name');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comment State
  const [commentInput, setCommentInput] = useState('');

  const filteredPosts = activeCategory === 'All' 
    ? posts 
    : posts.filter(p => p.category === activeCategory);

  const getDisplayName = (identity: IdentityOption) => {
    switch (identity) {
      case 'Real Name': return `${user.profile?.firstName} ${user.profile?.lastName}`;
      case 'Rank': return user.profile?.rank || 'Mariner';
      case 'Anonymous': return 'Anonymous Mariner';
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setNewPostImage(ev.target?.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCreatePost = () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) return;

    const newPost: ForumPost = {
      id: Date.now().toString(),
      authorId: user.id || 'temp',
      authorName: getDisplayName(newPostIdentity),
      authorRank: newPostIdentity !== 'Anonymous' ? user.profile?.rank : undefined,
      identityType: newPostIdentity,
      category: newPostCategory,
      title: newPostTitle,
      content: newPostContent,
      imageUrl: newPostImage || undefined,
      timestamp: Date.now(),
      likes: 0,
      commentCount: 0,
      comments: []
    };

    setPosts([newPost, ...posts]);
    setIsCreateModalOpen(false);
    // Reset Form
    setNewPostTitle('');
    setNewPostContent('');
    setNewPostImage(null);
    setNewPostCategory(ForumCategory.GENERAL);
  };

  const handlePostComment = () => {
    if (!selectedPost || !commentInput.trim()) return;

    const newComment: ForumComment = {
      id: Date.now().toString(),
      postId: selectedPost.id,
      authorId: user.id || 'temp',
      authorName: getDisplayName(newPostIdentity), // Re-using the state, but ideally could be separate for comments
      identityType: newPostIdentity,
      content: commentInput,
      timestamp: Date.now()
    };

    // Update Local State
    const updatedPost = {
      ...selectedPost,
      comments: [...(selectedPost.comments || []), newComment],
      commentCount: (selectedPost.commentCount || 0) + 1
    };

    setPosts(posts.map(p => p.id === selectedPost.id ? updatedPost : p));
    setSelectedPost(updatedPost);
    setCommentInput('');
  };

  const handleLike = (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    setPosts(posts.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
    if (selectedPost?.id === postId) {
      setSelectedPost(prev => prev ? { ...prev, likes: prev.likes + 1 } : null);
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // --- Views ---

  if (selectedPost) {
    // Detail View
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] animate-in slide-in-from-right duration-200">
        <div className="bg-white border-b border-slate-200 p-4 flex items-center sticky top-0 z-10">
          <button onClick={() => setSelectedPost(null)} className="p-2 hover:bg-slate-100 rounded-full mr-2">
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h2 className="font-bold text-lg text-slate-800">Discussion</h2>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          {/* Main Post */}
          <div className="bg-white p-4 mb-2">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedPost.identityType === 'Anonymous' ? 'bg-slate-800' : 'bg-blue-100'}`}>
                {selectedPost.identityType === 'Anonymous' ? <Ghost className="w-6 h-6 text-white" /> : <UserIcon className="w-6 h-6 text-blue-600" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">{selectedPost.authorName}</h3>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  {selectedPost.authorRank && <span>{selectedPost.authorRank}</span>}
                  <span>•</span>
                  <span>{getTimeAgo(selectedPost.timestamp)}</span>
                </div>
              </div>
            </div>
            
            <h1 className="text-xl font-bold text-slate-900 mb-2">{selectedPost.title}</h1>
            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded mb-4 font-medium">{selectedPost.category}</span>
            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedPost.content}</p>
            
            {selectedPost.imageUrl && (
              <img src={selectedPost.imageUrl} alt="Post attachment" className="mt-4 rounded-xl w-full object-cover max-h-80" />
            )}

            <div className="flex items-center gap-6 mt-6 pt-4 border-t border-slate-100">
               <button onClick={(e) => handleLike(e, selectedPost.id)} className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors">
                  <Heart className="w-5 h-5" /> {selectedPost.likes}
               </button>
               <div className="flex items-center gap-2 text-slate-500">
                  <MessageCircle className="w-5 h-5" /> {selectedPost.commentCount}
               </div>
            </div>
          </div>

          {/* Comments List */}
          <div className="px-4 pb-4 space-y-4">
            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide mt-4 mb-2">Comments</h4>
            {selectedPost.comments && selectedPost.comments.length > 0 ? (
              selectedPost.comments.map(comment => (
                <div key={comment.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                   <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-sm text-slate-800">{comment.authorName}</span>
                      <span className="text-[10px] text-slate-400">{getTimeAgo(comment.timestamp)}</span>
                   </div>
                   <p className="text-sm text-slate-600">{comment.content}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">No comments yet. Be the first!</div>
            )}
          </div>
        </div>

        {/* Comment Input */}
        <div className="bg-white border-t border-slate-200 p-3 sticky bottom-0 z-20">
           <div className="flex gap-2 items-end">
              <div className="relative flex-1">
                 <textarea 
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={`Comment as ${getDisplayName(newPostIdentity)}...`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none max-h-32"
                    rows={1}
                 />
                 <button 
                    onClick={() => setIsCreateModalOpen(true)} // Quick toggle identity? For simplicity just keeping static for now or reusing modal logic implies complexity.
                                                              // Let's just assume identity preference persists from create modal or default.
                    className="absolute right-2 bottom-2 text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium"
                 >
                    {newPostIdentity}
                 </button>
              </div>
              <button 
                onClick={handlePostComment}
                disabled={!commentInput.trim()}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
           </div>
        </div>
      </div>
    );
  }

  // Feed View
  return (
    <div className="pb-20 relative min-h-screen">
      {/* Categories Header */}
      <div className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 py-2 border-b border-slate-200">
        <div className="flex gap-2 overflow-x-auto px-4 scrollbar-hide">
          {['All', ...Object.values(ForumCategory)].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                activeCategory === cat
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Post List */}
      <div className="p-4 space-y-4">
        {filteredPosts.map(post => (
          <div 
            key={post.id} 
            onClick={() => setSelectedPost(post)}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.99] transition-transform cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${post.identityType === 'Anonymous' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>
                    {post.identityType === 'Anonymous' ? <Ghost className="w-3 h-3 inline mr-1"/> : <Shield className="w-3 h-3 inline mr-1"/>}
                    {post.authorName}
                 </span>
                 <span className="text-slate-300 text-[10px]">•</span>
                 <span className="text-[10px] text-slate-400">{getTimeAgo(post.timestamp)}</span>
              </div>
              <MoreHorizontal className="w-4 h-4 text-slate-300" />
            </div>

            <h3 className="font-bold text-slate-800 mb-1 leading-snug">{post.title}</h3>
            <p className="text-sm text-slate-600 line-clamp-3 mb-3">{post.content}</p>
            
            {post.imageUrl && (
               <div className="mb-3 rounded-lg overflow-hidden h-40 w-full relative">
                  <img src={post.imageUrl} className="w-full h-full object-cover" alt="Post" />
               </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-2">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{post.category}</span>
               <div className="flex gap-4">
                  <button onClick={(e) => handleLike(e, post.id)} className="flex items-center gap-1.5 text-slate-500 text-xs font-medium hover:text-red-500">
                     <Heart className="w-4 h-4" /> {post.likes}
                  </button>
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                     <MessageCircle className="w-4 h-4" /> {post.commentCount}
                  </div>
               </div>
            </div>
          </div>
        ))}
        <div className="h-16"></div> {/* Spacer for FAB */}
      </div>

      {/* Create Post FAB */}
      <button 
        onClick={() => setIsCreateModalOpen(true)}
        className="fixed bottom-24 right-4 bg-blue-600 text-white p-4 rounded-full shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-transform hover:scale-105 active:scale-95 z-20"
      >
        <PenSquare className="w-6 h-6" />
      </button>

      {/* Create Post Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)}></div>
           <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-5">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-lg text-slate-800">New Discussion</h3>
                 <button onClick={() => setIsCreateModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X className="w-6 h-6 text-slate-500" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {/* Identity Selector */}
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Posting As</label>
                    <div className="grid grid-cols-3 gap-2">
                       {(['Real Name', 'Rank', 'Anonymous'] as const).map(option => (
                          <button
                             key={option}
                             onClick={() => setNewPostIdentity(option)}
                             className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                                newPostIdentity === option 
                                ? 'bg-blue-600 text-white border-blue-600' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                             }`}
                          >
                             {option === 'Real Name' && user.profile?.firstName}
                             {option === 'Rank' && (user.profile?.rank || 'Rank')}
                             {option === 'Anonymous' && 'Anonymous'}
                          </button>
                       ))}
                    </div>
                 </div>

                 <input 
                    type="text" 
                    placeholder="Title (e.g. Question about CDC...)" 
                    value={newPostTitle}
                    onChange={e => setNewPostTitle(e.target.value)}
                    className="w-full text-lg font-bold placeholder:text-slate-300 border-none outline-none focus:ring-0 px-0"
                 />

                 <textarea 
                    placeholder="What's on your mind?" 
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value)}
                    className="w-full h-32 resize-none text-slate-700 placeholder:text-slate-400 border-none outline-none focus:ring-0 px-0"
                 ></textarea>

                 {newPostImage && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                       <img src={newPostImage} alt="Preview" className="w-full object-cover max-h-48" />
                       <button onClick={() => setNewPostImage(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-4 h-4"/></button>
                    </div>
                 )}

                 <div className="flex items-center gap-3 pt-2">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors">
                       <ImageIcon className="w-5 h-5" />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                    
                    <div className="relative flex-1">
                       <select 
                          value={newPostCategory} 
                          onChange={(e) => setNewPostCategory(e.target.value as ForumCategory)}
                          className="w-full appearance-none bg-slate-100 text-slate-600 font-medium text-sm py-2 pl-3 pr-8 rounded-lg outline-none"
                       >
                          {Object.values(ForumCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                       </select>
                       <Filter className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                 </div>
              </div>

              <div className="p-4 border-t border-slate-100">
                 <button 
                    onClick={handleCreatePost}
                    disabled={!newPostTitle.trim() || !newPostContent.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                 >
                    Post Discussion
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};