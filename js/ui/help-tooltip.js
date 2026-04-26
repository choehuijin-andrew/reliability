/**
 * RE-Suite Static — 도움말 툴팁 유틸리티
 */
const HelpTooltip = {
    /**
     * 도움말 버튼 HTML 생성
     * @param {string} text - 툴팁 텍스트
     * @returns {string} HTML string
     */
    create(text) {
        const id = 'tip_' + Math.random().toString(36).substr(2, 6);
        return `<span class="tooltip-container">
            <button class="help-btn" type="button"
                    onmouseenter="HelpTooltip.show('${id}')"
                    onmouseleave="HelpTooltip.hide('${id}')"
                    onclick="HelpTooltip.toggle('${id}')">?</button>
            <div class="tooltip-popup" id="${id}">${text}</div>
        </span>`;
    },

    show(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('show');
    },

    hide(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    },

    toggle(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('show');
    },

    /**
     * label + ? 버튼 조합 HTML
     */
    labelWithHelp(labelText, helpText, forId) {
        return `<div class="label-row">
            <label${forId ? ` for="${forId}"` : ''}>${labelText}</label>
            ${this.create(helpText)}
        </div>`;
    }
};
