import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Users, ShoppingBag, MousePointerClick, ArrowUpRight } from 'lucide-react';

interface EcommerceAnalyticsProps {
  colaboradorId?: string;
  colaboradorNome?: string;
}

export function EcommerceAnalytics({ colaboradorId, colaboradorNome }: EcommerceAnalyticsProps) {
  // Dados simulados para o painel
  const kpis = [
    { title: 'Ticket Médio', value: 'R$ 145,20', change: '+12.5%', isPositive: true, icon: TrendingUp },
    { title: 'Taxa de Conversão', value: '3.2%', change: '+0.8%', isPositive: true, icon: MousePointerClick },
    { title: 'Acessos Loja', value: '12.450', change: '+5.4%', isPositive: true, icon: Users },
    { title: 'Vendas (Hub)', value: '398', change: '-2.1%', isPositive: false, icon: ShoppingBag },
  ];

  const salesData = [
    { name: 'Seg', vendas: 45, cliques: 1200 },
    { name: 'Ter', vendas: 52, cliques: 1350 },
    { name: 'Qua', vendas: 38, cliques: 1100 },
    { name: 'Qui', vendas: 65, cliques: 1600 },
    { name: 'Sex', vendas: 85, cliques: 2100 },
    { name: 'Sáb', vendas: 110, cliques: 3200 },
    { name: 'Dom', vendas: 95, cliques: 2800 },
  ];

  const topProducts = [
    { id: 1, name: 'Smartphone Galaxy S23', category: 'Eletrônicos', clicks: 4520, conversions: 125 },
    { id: 2, name: 'Tênis Nike Air Max', category: 'Vestuário', clicks: 3100, conversions: 89 },
    { id: 3, name: 'Smart TV LG 55"', category: 'Eletrônicos', clicks: 2850, conversions: 45 },
    { id: 4, name: 'Perfume 212 Men', category: 'Perfumaria', clicks: 2100, conversions: 62 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div>
        <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-indigo-600" />
          Analytics & Inteligência - GSA Store
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Acompanhe o desempenho de cliques, conversões e ticket médio das ofertas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div key={index} className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{kpi.title}</p>
                  <p className="text-2xl font-black text-neutral-900 mt-1">{kpi.value}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold">
                <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${kpi.isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                  {kpi.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3 rotate-90" />}
                  {kpi.change}
                </span>
                <span className="text-neutral-400">vs semana anterior</span>
              </div>
              <div className="absolute -bottom-6 -right-6 h-24 w-24 bg-indigo-50 rounded-full opacity-50 transition-transform group-hover:scale-150 pointer-events-none" />
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
          <h3 className="text-sm font-bold text-neutral-800 mb-6">Desempenho de Vendas vs Cliques</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                  cursor={{ stroke: '#f4f4f5', strokeWidth: 2 }}
                />
                <Line yAxisId="left" type="monotone" dataKey="vendas" name="Conversões" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                <Line yAxisId="right" type="monotone" dataKey="cliques" name="Cliques/Acessos" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-neutral-800 mb-4">Produtos Mais Clicados</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {topProducts.map((product, idx) => (
              <div key={product.id} className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-neutral-100 flex items-center justify-center font-black text-neutral-400 text-xs">
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900 truncate">{product.name}</p>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-neutral-500">{product.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-indigo-600">{product.clicks.toLocaleString()}</p>
                  <p className="text-[10px] font-semibold text-neutral-500">Cliques</p>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full py-2 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-xs font-bold text-neutral-700 transition-colors">
            Ver Relatório Completo
          </button>
        </div>
      </div>
    </div>
  );
}
