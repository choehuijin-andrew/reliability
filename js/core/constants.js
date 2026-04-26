/**
 * RE-Suite Static — 상수 정의
 */
const CONSTANTS = {
    // 물리 상수
    BOLTZMANN_EV: 8.617333262145e-5,  // eV/K (볼츠만 상수)

    // 차트 색상 (의미론적)
    CHART_COLORS: {
        reliability: '#22c55e',  // R(t) — 초록: 생존
        failure:     '#ef4444',  // F(t) — 빨강: 고장
        density:     '#f59e0b',  // f(t) — 노랑: 발생
        hazard:      '#a78bfa',  // h(t) — 보라: 위험도
        accent:      '#38bdf8',  // 기본 액센트
        ci:          'rgba(56, 189, 248, 0.15)', // 신뢰구간 영역
    },

    // MLE 최적화
    MLE_MAX_ITER: 500,
    MLE_TOL: 1e-8,
    MIN_SAMPLE_FOR_MLE: 3,
    PLOT_POINTS: 200,

    // 시료수 계획
    MAX_SAMPLE_SEARCH: 100000,
};
