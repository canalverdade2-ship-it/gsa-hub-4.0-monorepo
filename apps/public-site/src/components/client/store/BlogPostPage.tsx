import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Calendar, User, ArrowLeft, Share2 } from 'lucide-react';
import { EcommerceHeader } from './EcommerceHeader';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSEO } from '../../../hooks/useSEO';
import { BlogPost } from '../../../types';
import DOMPurify from 'dompurify';

export function BlogPostPage({ postId, clientId }: { postId: string, clientId?: string }) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('id', postId)
          .maybeSingle();

        if (data && !error) {
          setPost(data);
        } else if (postId.startsWith('demo-')) {
          setPost({
            id: postId,
            title: 'As 10 melhores dicas para usar seu novo Smartphone',
            excerpt: 'Descubra os recursos ocultos e otimizações que farão a bateria do seu novo celular durar muito mais.',
            content: '<h1>Introdução</h1><p>Neste artigo, exploraremos os melhores truques do seu smartphone novo...</p>',
            image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=800&auto=format&fit=crop',
            category: 'Tecnologia',
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            author: 'GSA Curadoria (N8N)'
          });
        }
      } catch (err) {
        console.error('Erro ao buscar post:', err);
      } finally {
        setLoading(false);
      }
    };
    if (postId) fetchPost();
  }, [postId]);

  useSEO({
    title: post ? `${post.title} - Blog GSA Store` : 'Carregando... - Blog GSA Store',
    description: post?.excerpt || undefined,
    image: post?.image || undefined,
    type: 'article'
  });

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
        <EcommerceHeader clientId={clientId} cartItemCount={0} onOpenCart={() => {}} />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#17345f] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
        <EcommerceHeader clientId={clientId} cartItemCount={0} onOpenCart={() => {}} />
        <div className="flex flex-1 flex-col items-center justify-center">
          <h2 className="text-2xl font-bold text-neutral-800">Post não encontrado</h2>
          <button 
            onClick={() => navigate(routes.marketplace.store.blog())}
            className="mt-4 rounded-xl bg-[#17345f] px-6 py-3 font-bold text-white"
          >
            Voltar para o Blog
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <EcommerceHeader 
        clientId={clientId}
        cartItemCount={0}
        onOpenCart={() => navigate(routes.marketplace.store.products() + '?modal=carrinho')}
      />

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button 
          onClick={() => navigate(routes.marketplace.store.blog())}
          className="flex items-center gap-2 text-neutral-500 hover:text-[#17345f] transition-colors mb-8 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o Blog
        </button>

        <header className="mb-10 text-center">
          <div className="mb-4">
            <span className="inline-block bg-neutral-100 text-[#17345f] text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {post.category || 'Geral'}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-neutral-900 mb-6 leading-tight">
            {post.title}
          </h1>
          <div className="flex items-center justify-center gap-6 text-sm text-neutral-500 font-medium border-y border-neutral-100 py-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(post.published_at || post.created_at || new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })}
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {post.author || 'Equipe GSA'}
            </div>
          </div>
        </header>

        {post.image && (
          <div className="w-full h-64 md:h-96 rounded-3xl overflow-hidden mb-12 shadow-lg">
            <img 
              src={post.image} 
              alt={post.title} 
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {post.excerpt && (
          <p className="text-xl text-neutral-600 font-medium leading-relaxed mb-8 italic border-l-4 border-[#d8bd73] pl-6">
            {post.excerpt}
          </p>
        )}

        <div 
          className="prose prose-lg prose-indigo max-w-none text-neutral-700 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(post.content || '', {
              USE_PROFILES: { html: true },
            }),
          }}
        />

        <div className="mt-16 pt-8 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-neutral-500 font-medium">Gostou deste artigo?</p>
          <button 
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: post.title,
                  text: post.excerpt || '',
                  url: window.location.href
                });
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copiado!');
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold transition-colors"
          >
            <Share2 className="w-5 h-5" /> Compartilhar
          </button>
        </div>
      </article>
    </div>
  );
}
