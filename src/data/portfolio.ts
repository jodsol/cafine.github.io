export type PortfolioItem = {
	title: string;
	summary: string;
	href: string;
	kind: string;
	period: string;
	tags: string[];
	image?: string;
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
		period: '2020.08 - 2021.02',
		tags: ['JavaScript', 'WebSocket', 'jQuery', 'Performance'],
		image: '/shora.png',
	},
];
