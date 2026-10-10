export interface VIPLevel {
  id: string;
  name: string;
  minPoints: number;
  maxPoints: number | null;
  multiplier: number;
  color: string;
  secondaryColor?: string;
  textColor: string;
  benefits: string[];
  exclusiveBenefits: string[];
  visualStyle: 'clean' | 'copper' | 'silver' | 'gold-black' | 'diamond' | 'black-luxury';
  discountPercentage?: number;
  feePercentage: number;
  price: number;
  dbId?: string;
}

const vipLevel = (
  id: string,
  name: string,
  minPoints: number,
  maxPoints: number | null,
  multiplier: number,
  color: string,
  textColor: string,
  visualStyle: VIPLevel['visualStyle'],
  price: number,
): VIPLevel => ({
  id,
  name,
  minPoints,
  maxPoints,
  multiplier,
  color,
  textColor,
  visualStyle,
  discountPercentage: 0,
  feePercentage: 5,
  price,
  benefits: [`Multiplicador de pontos: ${multiplier}x`],
  exclusiveBenefits: [`Multiplicador de pontos: ${multiplier}x`],
});

export const VIP_LEVELS: VIPLevel[] = [
  vipLevel('basico', 'Básico', 0, 199, 0.5, '#f5f5f5', '#1a1a1a', 'clean', 0),
  vipLevel('bronze', 'Bronze', 200, 499, 1, '#cd7f32', '#ffffff', 'copper', 100),
  vipLevel('prata', 'Prata', 500, 899, 2, '#c0c0c0', '#1a1a1a', 'silver', 300),
  vipLevel('ouro', 'Ouro', 1000, 1499, 3, '#ffd700', '#000000', 'gold-black', 600),
  vipLevel('diamante', 'Diamante', 2000, 2999, 4, '#b9f2ff', '#000000', 'diamond', 1000),
  vipLevel('black', 'Black', 5000, null, 5, '#000000', '#ffffff', 'black-luxury', 2000),
];
