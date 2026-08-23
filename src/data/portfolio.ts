import type { ImageMetadata } from 'astro';
import flipflopOverviewImage from '../assets/portfolio/flipflop-overview.png';
import shoraImage from '../assets/portfolio/shora.png';

export type PortfolioItem = {
	title: string;
	summary: string;
	href: string;
	kind: string;
	period: string;
	tags: string[];
	image?: ImageMetadata;
};

export const portfolioProfile = {
	title: 'Frontend Developer',
	intro:
		'실시간 서비스와 사용자 인터랙션을 설계하고, 성능까지 고민하는 프론트엔드 개발자입니다. 그래픽스와 GPU 아키텍처는 더 나은 렌더링과 성능 이해를 위해 꾸준히 탐구하고 있습니다.',
	highlights: [
		'Live/VOD Player와 WebSocket 기반 실시간 기능 개발',
		'대량 데이터 환경의 UI 렌더링 성능 개선',
		'Vulkan, GPU 아키텍처, 컴퓨터 그래픽스 탐구',
	],
};

export const portfolioItems: PortfolioItem[] = [
	{
		title: 'SHORA Live Commerce Web App',
		summary:
			'Live/VOD 플레이어와 WebSocket 기반 실시간 채팅·인터랙션을 개발하고, 장시간 방송의 대량 채팅 렌더링 성능을 개선했습니다.',
		href: '/portfolio/shora/',
		kind: 'Live Commerce',
		period: '2021.08 - 2022.02',
		tags: ['JavaScript', 'WebSocket', 'jQuery', 'Performance'],
		image: shoraImage,
	},
	{
		title: 'FlipFlop Lite',
		summary:
			'영상 API/SDK 연동, DRM, WebSocket 기반 Chat SDK, 방송 운영 Dashboard까지 B2B Video SaaS의 클라이언트와 운영 영역을 개발했습니다.',
		href: '/portfolio/flipflop-lite/',
		kind: 'B2B Video SaaS',
		period: '2021.12 - 2023.02',
		tags: ['Video SDK', 'WebSocket', 'DRM', 'SaaS Dashboard'],
		image: flipflopOverviewImage,
	},
];
