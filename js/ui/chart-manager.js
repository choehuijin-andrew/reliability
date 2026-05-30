/**
 * RE-Suite Static — Chart.js 차트 관리자
 */
const ChartManager = {
    /** @type {Object<string, Chart>} 활성 차트 인스턴스 */
    _charts: {},

    /**
     * 차트 생성 또는 업데이트
     * @param {string} canvasId - canvas 요소 ID
     * @param {Object} config - Chart.js 설정
     * @returns {Chart}
     */
    createOrUpdate(canvasId, config) {
        if (this._charts[canvasId]) {
            this._charts[canvasId].destroy();
        }
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const isWhite = (document.body.getAttribute('data-theme') || 'white') === 'white';
        const textColor = isWhite ? '#475569' : '#8f9194';
        const gridColor = isWhite ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

        // 테마별 기본 설정 반영
        Chart.defaults.color = isWhite ? '#334155' : '#c5c6c7';
        Chart.defaults.borderColor = gridColor;
        Chart.defaults.font.family = "'Inter', sans-serif";

        // config의 scales가 있으면 테마 컬러 덮어쓰기
        if (config.options && config.options.scales) {
            Object.keys(config.options.scales).forEach(scaleKey => {
                const scale = config.options.scales[scaleKey];
                if (scale) {
                    if (!scale.grid) scale.grid = {};
                    scale.grid.color = gridColor;
                    if (!scale.ticks) scale.ticks = {};
                    scale.ticks.color = textColor;
                    if (scale.title) {
                        scale.title.color = textColor;
                    }
                }
            });
        }

        // config의 legend가 있으면 덮어쓰기
        if (config.options && config.options.plugins && config.options.plugins.legend) {
            if (!config.options.plugins.legend.labels) config.options.plugins.legend.labels = {};
            config.options.plugins.legend.labels.color = isWhite ? '#334155' : '#c5c6c7';
        }

        // 줌 및 팬 설정 자동 주입 (Ctrl 키 모디파이어 및 모바일 터치 오동작 방지)
        if (!config.options) config.options = {};
        if (!config.options.plugins) config.options.plugins = {};
        config.options.plugins.zoom = {
            pan: {
                enabled: true,
                mode: 'xy',
                modifierKey: 'ctrl',
                onPan: ({ chart }) => {
                    updateControlsFromChart(chart);
                }
            },
            zoom: {
                wheel: { enabled: true, modifierKey: 'ctrl' },
                pinch: { enabled: false },
                mode: 'xy',
                onZoom: ({ chart }) => {
                    updateControlsFromChart(chart);
                }
            }
        };

        const chart = new Chart(canvas, config);
        this._charts[canvasId] = chart;

        // 조작 컨트롤바 자동 부착 (비동기로 DOM 준비 대기)
        setTimeout(() => {
            attachControls(canvas, canvasId);
        }, 50);

        return chart;
    },

    /**
     * 차트 삭제
     */
    destroy(canvasId) {
        if (this._charts[canvasId]) {
            this._charts[canvasId].destroy();
            delete this._charts[canvasId];
        }
    },

    /**
     * 모든 차트 삭제
     */
    destroyAll() {
        Object.keys(this._charts).forEach(id => this.destroy(id));
    },

    /**
     * OC Curve (Operating Characteristic) 차트
     * @param {string} canvasId
     * @param {Array<{p: number, pa: number}>} data
     * @param {number} n - 시료수
     * @param {number} c - 허용 고장수
     */
    drawOCCurve(canvasId, data, n, c, targetP = null, targetBeta = null) {
        const datasets = [{
            label: `OC Curve (n=${n}, c=${c})`,
            data: data.map(d => ({ x: d.p * 100, y: d.pa })),
            borderColor: CONSTANTS.CHART_COLORS.accent,
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2.5,
        }];

        const maxP = data.length > 0 ? data[data.length - 1].p * 100 : 100;

        // 설계 기준점 및 가이드 라인 추가
        if (targetP !== null && targetBeta !== null) {
            // 수평선 (소비자 위험 Beta)
            datasets.push({
                label: `소비자 위험 (β = ${(targetBeta * 100).toFixed(0)}%)`,
                data: [{ x: 0, y: targetBeta }, { x: maxP, y: targetBeta }],
                borderColor: 'rgba(239, 68, 68, 0.65)',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1.5,
                fill: false,
                showLine: true
            });

            // 수직선 (허용 불량률 p)
            datasets.push({
                label: `허용 불량률 (p = ${targetP.toFixed(2)}%)`,
                data: [{ x: targetP, y: 0 }, { x: targetP, y: 1 }],
                borderColor: 'rgba(239, 68, 68, 0.65)',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1.5,
                fill: false,
                showLine: true
            });

            // 교점
            datasets.push({
                label: `설계 보증점`,
                data: [{ x: targetP, y: targetBeta }],
                borderColor: '#ef4444',
                backgroundColor: '#ef4444',
                pointRadius: 6,
                pointHoverRadius: 8,
                showLine: false
            });
        }

        this.createOrUpdate(canvasId, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'top',
                        labels: {
                            filter: (legendItem) => {
                                // 수평/수직 가이드선 범례는 제외하고 주요 곡선과 보증점만 노출
                                return legendItem.datasetIndex === 0 || legendItem.datasetIndex === 3;
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const p = ctx.parsed.x;
                                const pa = ctx.parsed.y;
                                if (ctx.datasetIndex === 3) {
                                    return `보증 타겟: 불량률 ${p.toFixed(2)}%, 합격확률(β) ${(pa * 100).toFixed(1)}%`;
                                }
                                if (ctx.datasetIndex > 0) return null; // 가이드라인 툴팁 제외
                                const consumerRisk = pa;
                                const producerRisk = 1 - pa;
                                return [
                                    `합격 확률 (Pa): ${(pa * 100).toFixed(1)}%`,
                                    `소비자 위험 (LTPD 합격 확률): ${(consumerRisk * 100).toFixed(1)}%`,
                                    `생산자 위험 (양품 불합격 확률): ${(producerRisk * 100).toFixed(1)}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: '불량률 p (%)', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        title: { display: true, text: '합격 확률 Pa', color: '#64748b' },
                        min: 0, max: 1,
                        ticks: { 
                            color: '#64748b',
                            callback: v => (v * 100).toFixed(0) + '%' 
                        },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
    },

    /**
     * n vs TestTime 트레이드오프 차트
     */
    drawTradeoff(canvasId, data, xlabel = '시료수 (n)', ylabel = '시험 시간') {
        this.createOrUpdate(canvasId, {
            type: 'line',
            data: {
                labels: data.map(d => d.n),
                datasets: [{
                    label: '필요 시험 시간',
                    data: data.map(d => d.time),
                    borderColor: CONSTANTS.CHART_COLORS.accent,
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => `n=${item.label}, 시간=${Number(item.raw).toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: xlabel } },
                    y: {
                        title: { display: true, text: ylabel },
                        ticks: { callback: v => v.toLocaleString() }
                    }
                }
            }
        });
    },

    /**
     * 범용 Line 차트 (f(t), F(t), R(t), h(t) 등)
     */
    drawLine(canvasId, datasets, xLabel = 't', yLabel = '', options = {}) {
        const chartDatasets = datasets.map(ds => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.color || CONSTANTS.CHART_COLORS.accent,
            backgroundColor: ds.fill ? (ds.fillColor || ds.color + '20') : 'transparent',
            fill: ds.fill || false,
            tension: 0.3,
            pointRadius: ds.pointRadius ?? 0,
            borderWidth: ds.borderWidth ?? 2,
            borderDash: ds.dashed ? [5, 5] : [],
        }));

        this.createOrUpdate(canvasId, {
            type: 'line',
            data: { datasets: chartDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: datasets.length > 1, position: 'top' },
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: xLabel },
                        ...options.xScale
                    },
                    y: {
                        title: { display: true, text: yLabel },
                        ...options.yScale
                    }
                }
            }
        });
    },

    /**
     * createChart — createOrUpdate의 alias (신뢰성 분석 탭 등에서 사용)
     */
    createChart(canvasId, config) {
        return this.createOrUpdate(canvasId, config);
    },

    /**
     * AF vs 스트레스 차트
     */
    drawAFvsStress(canvasId, data, xLabel = '스트레스', currentStress = null) {
        const datasets = [{
            label: 'AF',
            data: data.map(d => ({ x: d.stress, y: d.af })),
            borderColor: CONSTANTS.CHART_COLORS.warning,
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2.5,
        }];

        // 현재 스트레스 포인트 강조
        if (currentStress !== null) {
            const currentAF = data.find(d => Math.abs(d.stress - currentStress) < 3);
            if (currentAF) {
                datasets.push({
                    label: '현재 조건',
                    data: [{ x: currentAF.stress, y: currentAF.af }],
                    borderColor: CONSTANTS.CHART_COLORS.danger,
                    backgroundColor: CONSTANTS.CHART_COLORS.danger,
                    pointRadius: 8,
                    pointStyle: 'rectRounded',
                    showLine: false,
                });
            }
        }

        this.createOrUpdate(canvasId, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: datasets.length > 1, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (item) => `AF = ${Number(item.raw.y).toFixed(2)}×`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: xLabel }
                    },
                    y: {
                        title: { display: true, text: '가속 계수 (AF)' },
                        ticks: { callback: v => v.toFixed(1) + '×' }
                    }
                }
            }
        });
    },

    /**
     * Bar 차트 (Warranty 월별 고장 등)
     */
    drawBar(canvasId, labels, datasets, xLabel = '', yLabel = '') {
        const chartDS = datasets.map(ds => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: ds.color || CONSTANTS.CHART_COLORS.danger,
            borderRadius: 3,
            maxBarThickness: 40,
        }));

        this.createOrUpdate(canvasId, {
            type: 'bar',
            data: { labels, datasets: chartDS },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: datasets.length > 1, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (item) => `${item.dataset.label}: ${Number(item.raw).toFixed(1)}`
                        }
                    }
                },
                scales: {
                    x: { title: { display: !!xLabel, text: xLabel } },
                    y: {
                        title: { display: !!yLabel, text: yLabel },
                        beginAtZero: true,
                        ticks: { callback: v => v.toLocaleString() }
                    }
                }
            }
        });
    },

    /**
     * Dual-axis Line 차트 (누적 고장 + 누적 비용 등)
     */
    drawDualAxis(canvasId, labels, ds1, ds2, xLabel = '') {
        this.createOrUpdate(canvasId, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: ds1.label,
                        data: ds1.data,
                        borderColor: ds1.color || CONSTANTS.CHART_COLORS.danger,
                        tension: 0.3, pointRadius: 2, borderWidth: 2.5,
                        yAxisID: 'y',
                    },
                    {
                        label: ds2.label,
                        data: ds2.data,
                        borderColor: ds2.color || CONSTANTS.CHART_COLORS.warning,
                        borderDash: [5, 3],
                        tension: 0.3, pointRadius: 0, borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    x: { title: { display: !!xLabel, text: xLabel } },
                    y: {
                        type: 'linear', position: 'left',
                        title: { display: true, text: ds1.label },
                        ticks: { callback: v => v.toLocaleString() }
                    },
                    y1: {
                        type: 'linear', position: 'right',
                        title: { display: true, text: ds2.label },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: v => '$' + v.toLocaleString() }
                    }
                }
            }
        });
    },

    /**
     * 테마 변경에 따른 차트 색상 업데이트
     * @param {string} themeName - 'white' 또는 'black'
     */
    updateTheme(themeName) {
        const isWhite = themeName === 'white';
        const textColor = isWhite ? '#475569' : '#8f9194';
        const gridColor = isWhite ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        const legendColor = isWhite ? '#334155' : '#c5c6c7';

        // 1. Chart.js 기본 설정 변경 (이후 그려지는 차트에 적용)
        Chart.defaults.color = legendColor;
        Chart.defaults.borderColor = gridColor;

        // 2. 기존 활성 차트 업데이트
        Object.keys(this._charts).forEach(id => {
            const chart = this._charts[id];
            if (!chart || !chart.options || !chart.options.scales) return;

            // X축 업데이트
            if (chart.options.scales.x) {
                if (!chart.options.scales.x.grid) chart.options.scales.x.grid = {};
                chart.options.scales.x.grid.color = gridColor;
                if (!chart.options.scales.x.ticks) chart.options.scales.x.ticks = {};
                chart.options.scales.x.ticks.color = textColor;
                if (chart.options.scales.x.title) {
                    chart.options.scales.x.title.color = textColor;
                }
            }

            // Y축 업데이트
            if (chart.options.scales.y) {
                if (!chart.options.scales.y.grid) chart.options.scales.y.grid = {};
                chart.options.scales.y.grid.color = gridColor;
                if (!chart.options.scales.y.ticks) chart.options.scales.y.ticks = {};
                chart.options.scales.y.ticks.color = textColor;
                if (chart.options.scales.y.title) {
                    chart.options.scales.y.title.color = textColor;
                }
            }

            // 보조 Y축 (y1) 업데이트 (있을 경우)
            if (chart.options.scales.y1) {
                if (!chart.options.scales.y1.grid) chart.options.scales.y1.grid = {};
                chart.options.scales.y1.grid.color = gridColor;
                if (!chart.options.scales.y1.ticks) chart.options.scales.y1.ticks = {};
                chart.options.scales.y1.ticks.color = textColor;
                if (chart.options.scales.y1.title) {
                    chart.options.scales.y1.title.color = textColor;
                }
            }

            // 범례 색상 업데이트
            if (chart.options.plugins && chart.options.plugins.legend) {
                if (!chart.options.plugins.legend.labels) chart.options.plugins.legend.labels = {};
                chart.options.plugins.legend.labels.color = legendColor;
            }

            chart.update();
        });
    }
};

function updateControlsFromChart(chart) {
    const canvas = chart.canvas;
    const container = canvas.closest('.chart-container') || canvas;
    const controls = container.nextElementSibling;
    if (controls && controls.classList.contains('chart-controls')) {
        const xMinInput = controls.querySelector('.x-min');
        const xMaxInput = controls.querySelector('.x-max');
        const yMinInput = controls.querySelector('.y-min');
        const yMaxInput = controls.querySelector('.y-max');
        
        if (xMinInput && chart.scales.x && chart.scales.x.min !== undefined) {
            xMinInput.value = Number(chart.scales.x.min.toFixed(2));
        }
        if (xMaxInput && chart.scales.x && chart.scales.x.max !== undefined) {
            xMaxInput.value = Number(chart.scales.x.max.toFixed(2));
        }
        if (yMinInput && chart.scales.y && chart.scales.y.min !== undefined) {
            yMinInput.value = Number(chart.scales.y.min.toFixed(2));
        }
        if (yMaxInput && chart.scales.y && chart.scales.y.max !== undefined) {
            yMaxInput.value = Number(chart.scales.y.max.toFixed(2));
        }
    }
}

function attachControls(canvas, canvasId) {
    const targetCharts = [
        'chart-pdf', 'chart-hf', 'chart-cdf', 'chart-sf', 'chart-contour',
        'warranty-bar-chart', 'warranty-cumul-chart', 'warranty-pdf-chart', 'warranty-hf-chart', 'warranty-cdf-chart', 'warranty-sf-chart',
        'degrad-path-chart', 'degrad-lifetime-chart', 'acc-tradeoff-chart', 'acc-af-chart', 'wbx-tradeoff-chart', 'oc-chart'
    ];

    if (!targetCharts.includes(canvasId)) return;

    const container = canvas.closest('.chart-container') || canvas;
    const nextSib = container.nextElementSibling;
    if (nextSib && nextSib.classList.contains('chart-controls')) {
        return; // 이미 부착됨
    }

    const controlsHtml = `
        <div class="chart-controls" data-chart-id="${canvasId}">
            <span class="chart-controls-label">축 범위 조정:</span>
            <div class="chart-controls-row" style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; align-items: center;">
                <div class="chart-controls-group">
                    <span>X축:</span>
                    <input type="number" class="scale-input x-min" placeholder="최소" />
                    <span>~</span>
                    <input type="number" class="scale-input x-max" placeholder="최대" />
                </div>
                <div class="chart-controls-group">
                    <span>Y축:</span>
                    <input type="number" class="scale-input y-min" placeholder="최소" />
                    <span>~</span>
                    <input type="number" class="scale-input y-max" placeholder="최대" />
                </div>
            </div>
            <div class="chart-controls-row" style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
                <button class="btn btn-secondary btn-apply-scale">적용</button>
                <button class="btn btn-secondary btn-auto-scale">자동</button>
                <button class="btn btn-secondary btn-reset-zoom">초기화</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('afterend', controlsHtml);

    const controlsEl = container.nextElementSibling;
    const xMinInput = controlsEl.querySelector('.x-min');
    const xMaxInput = controlsEl.querySelector('.x-max');
    const yMinInput = controlsEl.querySelector('.y-min');
    const yMaxInput = controlsEl.querySelector('.y-max');

    const applyScale = () => {
        const chart = ChartManager._charts[canvasId];
        if (!chart) return;

        const xm = xMinInput.value;
        const xM = xMaxInput.value;
        const ym = yMinInput.value;
        const yM = yMaxInput.value;

        if (!chart.options.scales.x) chart.options.scales.x = {};
        if (!chart.options.scales.y) chart.options.scales.y = {};

        if (xm !== '') chart.options.scales.x.min = parseFloat(xm); else delete chart.options.scales.x.min;
        if (xM !== '') chart.options.scales.x.max = parseFloat(xM); else delete chart.options.scales.x.max;
        if (ym !== '') chart.options.scales.y.min = parseFloat(ym); else delete chart.options.scales.y.min;
        if (yM !== '') chart.options.scales.y.max = parseFloat(yM); else delete chart.options.scales.y.max;

        chart.update();
    };

    controlsEl.querySelector('.btn-apply-scale').addEventListener('click', applyScale);

    [xMinInput, xMaxInput, yMinInput, yMaxInput].forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    applyScale();
                }
            });
        }
    });

    controlsEl.querySelector('.btn-auto-scale').addEventListener('click', () => {
        const chart = ChartManager._charts[canvasId];
        if (!chart) return;

        xMinInput.value = '';
        xMaxInput.value = '';
        yMinInput.value = '';
        yMaxInput.value = '';

        if (chart.options.scales.x) {
            delete chart.options.scales.x.min;
            delete chart.options.scales.x.max;
        }
        if (chart.options.scales.y) {
            delete chart.options.scales.y.min;
            delete chart.options.scales.y.max;
        }

        chart.update();
    });

    controlsEl.querySelector('.btn-reset-zoom').addEventListener('click', () => {
        const chart = ChartManager._charts[canvasId];
        if (!chart) return;

        xMinInput.value = '';
        xMaxInput.value = '';
        yMinInput.value = '';
        yMaxInput.value = '';

        if (typeof chart.resetZoom === 'function') {
            chart.resetZoom();
        }

        if (chart.options.scales.x) {
            delete chart.options.scales.x.min;
            delete chart.options.scales.x.max;
        }
        if (chart.options.scales.y) {
            delete chart.options.scales.y.min;
            delete chart.options.scales.y.max;
        }
        chart.update();
    });
}
