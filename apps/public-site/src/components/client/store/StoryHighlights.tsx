import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_STORIES = [
  {
    id: 1,
    title: "Ofertas de Hoje",
    thumbnail: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=200&h=200&auto=format&fit=crop",
    slides: [
      {
        image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=600&h=1000&auto=format&fit=crop",
        title: "50% OFF em Eletrônicos",
        cta: "Ver Oferta"
      }
    ]
  },
  {
    id: 2,
    title: "Lançamentos",
    thumbnail: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=200&h=200&auto=format&fit=crop",
    slides: [
      {
        image: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=600&h=1000&auto=format&fit=crop",
        title: "Novo Tênis Nike",
        cta: "Comprar Agora"
      }
    ]
  },
  {
    id: 3,
    title: "Mais Vendidos",
    thumbnail: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=200&h=200&auto=format&fit=crop",
    slides: [
      {
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&h=1000&auto=format&fit=crop",
        title: "Relógio Smart",
        cta: "Ver Detalhes"
      }
    ]
  }
];

export function StoryHighlights() {
  const [activeStory, setActiveStory] = useState<number | null>(null);

  const openStory = (id: number) => {
    setActiveStory(id);
  };

  const closeStory = () => {
    setActiveStory(null);
  };

  const story = activeStory !== null ? MOCK_STORIES.find(s => s.id === activeStory) : null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 scrollbar-hide snap-x overscroll-x-contain touch-pan-y touch-pan-x">
        {MOCK_STORIES.map((s) => (
          <button
            key={s.id}
            onClick={() => openStory(s.id)}
            className="flex flex-col items-center gap-2 flex-shrink-0 group snap-start"
          >
            <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#d8bd73] to-indigo-600 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover" />
              </div>
            </div>
            <span className="text-xs font-bold text-neutral-700">{s.title}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeStory !== null && story && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
            <button onClick={closeStory} className="absolute top-4 right-4 text-white z-[110]">
              <X className="w-8 h-8" />
            </button>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm h-[80vh] rounded-3xl overflow-hidden bg-neutral-900"
            >
              {/* Progress Bars */}
              <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
                <div className="h-1 bg-white flex-1 rounded-full overflow-hidden">
                  <div className="h-full bg-white/50 w-full animate-[progress_5s_linear_forwards]" />
                </div>
              </div>

              <img 
                src={story.slides[0].image} 
                className="w-full h-full object-cover" 
                alt="" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              
              <div className="absolute bottom-8 left-0 right-0 p-6 text-center">
                <h3 className="text-2xl font-black text-white mb-4">{story.slides[0].title}</h3>
                <button className="bg-[#d8bd73] text-[#17345f] px-8 py-3 rounded-full font-bold uppercase tracking-wider w-full hover:bg-white transition-colors">
                  {story.slides[0].cta}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
