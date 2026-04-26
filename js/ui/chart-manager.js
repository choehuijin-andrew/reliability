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

        // 다크 테마 기본 설정
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
        Chart.defaults.font.family = "'Inter', sans-serif";

        const chart = new Chart(canvas, config);
        this._charts[canvasId] = chart;
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
    drawOCCurve(canvasId, data, n, c) {
        this.createOrUpdate(canvasId, {
            type: 'line',
            data: {
                labels: data.map(d => (d.p * 100).toFixed(1)),
                datasets: [{
                    label: `OC Curve (n=${n}, c=${c})`,
                    data: data.map(d => d.pa),
                    borderColor: CONSTANTS.CHART_COLORS.accent,
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            title: (items) => `불량률: ${items[0].label}%`,
                            label: (item) => `합격 확률: ${(item.raw * 100).toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '불량률 p (%)' },
                        ticks: { maxTicksLimit: 10 }
                    },
                    y: {
                        title: { display: true, text: '합격 확률 Pa' },
                        min: 0, max: 1,
                        ticks: { callback: v => (v * 100).toFixed(0) + '%' }
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
    }
};
