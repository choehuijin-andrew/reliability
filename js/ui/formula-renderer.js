/**
 * RE-Suite Static — KaTeX 수식 렌더링 유틸리티
 */
const FormulaRenderer = {
    /**
     * KaTeX로 수식 렌더링 (인라인)
     * @param {string} latex - LaTeX 수식 문자열
     * @returns {string} 렌더링된 HTML
     */
    inline(latex) {
        try {
            return katex.renderToString(latex, { throwOnError: false, displayMode: false });
        } catch (e) {
            return `<code>${latex}</code>`;
        }
    },

    /**
     * KaTeX로 수식 렌더링 (블록/디스플레이)
     * @param {string} latex
     * @returns {string}
     */
    block(latex) {
        try {
            return katex.renderToString(latex, { throwOnError: false, displayMode: true });
        } catch (e) {
            return `<pre>${latex}</pre>`;
        }
    },

    /**
     * DOM 요소에 직접 렌더링
     * @param {string} elementId
     * @param {string} latex
     * @param {boolean} displayMode
     */
    renderTo(elementId, latex, displayMode = true) {
        const el = document.getElementById(elementId);
        if (!el) return;
        try {
            katex.render(latex, el, { throwOnError: false, displayMode });
        } catch (e) {
            el.textContent = latex;
        }
    },

    /**
     * 계산 과정 스텝 HTML 생성
     * @param {string} label - 스텝 설명
     * @param {string} latex - 수식
     * @returns {string}
     */
    step(label, latex) {
        return `<div class="formula-step">
            <span style="color: var(--text-muted)">${label}</span><br>
            ${this.block(latex)}
        </div>`;
    },

    /**
     * 강조 수식 박스
     */
    highlight(latex) {
        return `<div class="formula-highlight">${this.block(latex)}</div>`;
    }
};
