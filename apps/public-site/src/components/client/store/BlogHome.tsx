import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Calendar, User, ArrowRight, BookOpen } from 'lucide-react';
import { EcommerceHeader } from './EcommerceHeader';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSEO } from '../../../hooks/useSEO';

export function BlogHome({ clientId }: { clientId?: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useSEO({
    title: 'Blog GSA Store - Dicas e Tendências',
    description: 'Conteúdo curado automaticamente pela nossa inteligência artificial para trazer as melhores dicas, tendências e reviews.',
    type: 'article'
  });

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .order('published_at', { ascending: false });

        const fallbackPosts = [
          {
            id: 'demo-1',
            title: 'As 10 melhores dicas para usar seu novo Smartphone',
            excerpt: 'Descubra os recursos ocultos e otimizações que farão a bateria do seu novo celular durar muito mais.',
            image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=800&auto=format&fit=crop',
            category: 'Tecnologia',
            published_at: new Date().toISOString(),
            author: 'GSA Curadoria'
          }
        ];

        // A tabela de blog pode ainda não existir no ambiente (conteúdo publicado por automação).
        if (error) {
          const missingTable = (error as any)?.code === '42P01';
          if (!missingTable) console.warn('Não foi possível carregar os posts do blog:', error.message);
          setPosts(fallbackPosts);
          return;
        }

        setPosts(!data || data.length === 0 ? fallbackPosts : data);
      } catch (err) {
        console.warn('Não foi possível carregar os posts do blog:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <EcommerceHeader 
        clientId={clientId}
        cartItemCount={0}
        onOpenCart={() => navigate(routes.marketplace.store.products() + '?modal=carrinho')}
      />

      <div className="bg-[#17345f] text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-[#d8bd73] mb-4" />
          <h1 className="text-4xl font-black mb-4">Blog GSA Store</h1>
          <p className="text-white/70 max-w-2xl mx-auto text-lg">
            Conteúdo curado automaticamente pela nossa inteligência artificial para trazer as melhores dicas, tendências e reviews.
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex flex-col bg-white rounded-3xl overflow-hidden shadow-sm h-96">
                <div className="h-48 bg-neutral-200"></div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="h-4 w-20 bg-neutral-200 rounded mb-4"></div>
                    <div className="h-6 w-full bg-neutral-200 rounded mb-2"></div>
                    <div className="h-6 w-2/3 bg-neutral-200 rounded mb-4"></div>
                    <div className="h-4 w-full bg-neutral-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map(post => (
              <article key={post.id} className="flex flex-col bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group border border-neutral-100">
                <div className="relative h-48 overflow-hidden">
                  <div className="absolute top-4 left-4 z-10">
                    <span className="bg-white/90 backdrop-blur text-[#17345f] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      {post.category}
                    </span>
                  </div>
                  <img 
                    src={post.image} 
                    alt={post.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-4 text-xs font-medium text-neutral-400 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(post.published_at || post.created_at || new Date()), "dd 'de' MMMM", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {post.author}
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-neutral-900 mb-3 line-clamp-2">
                    {post.title}
                  </h2>
                  <p className="text-neutral-500 text-sm mb-6 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="mt-auto">
                    <button 
                      onClick={() => navigate(routes.marketplace.store.blogPost(post.id))}
                      className="flex items-center gap-2 text-[#17345f] font-bold text-sm hover:text-[#d8bd73] transition-colors"
                    >
                      Ler artigo <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
