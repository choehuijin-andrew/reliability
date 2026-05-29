/**
 * RE-Suite Static — 가속 수명 모델 모듈
 * Ref: JEDEC JESD91, IEC 61709, MIL-HDBK-338B
 */
const Acceleration = {
    K: CONSTANTS.BOLTZMANN_EV,

    // ─── 아레니우스 모델 ───
    // AF = exp((Ea/k) * (1/Tu - 1/Ts))
    // Ref: JEDEC JESD91, Eq.1; IEC 61709, Section 6.2
    calcArrhenius(ea, tUse, tStress) {
        const tuK = tUse + 273.15;
        const tsK = tStress + 273.15;
        return Math.exp((ea / this.K) * (1 / tuK - 1 / tsK));
    },

    // ─── 펙 모델 (온도+습도) ───
    // AF = (RHs/RHu)^n * Arrhenius(T)
    // Ref: Peck (1986), JEDEC JESD91A Section 3.3
    calcPeck(ea, n, tUse, rhUse, tStress, rhStress) {
        const afT = this.calcArrhenius(ea, tUse, tStress);
        const afRH = Math.pow(rhStress / rhUse, n);
        return afT * afRH;
    },

    // ─── 코핀-맨슨 모델 (열 사이클) ───
    // AF = (ΔTs/ΔTu)^m
    // Ref: Coffin (1954), IPC-9701A
    calcCoffinManson(m, dtUse, dtStress) {
        return Math.pow(dtStress / dtUse, m);
    },

    // ─── 역거듭제곱 법칙 ───
    // AF = (Vs/Vu)^n
    // Ref: Nelson (1990), Ch.2
    calcInversePower(n, vUse, vStress) {
        return Math.pow(vStress / vUse, n);
    },

    // ─── Eyring 모델 ───
    // AF = (Tu/Ts) * exp((Ea/k)*(1/Tu - 1/Ts)) * exp(B*(Ss - Su))
    // Ref: JEDEC JESD91A, Section 3.4
    calcEyring(ea, tUse, tStress, b = 0, sUse = 0, sStress = 0) {
        const tuK = tUse + 273.15;
        const tsK = tStress + 273.15;
        let af = (tuK / tsK) * Math.exp((ea / this.K) * (1 / tuK - 1 / tsK));
        if (b !== 0 && sUse > 0 && sStress > 0) {
            af *= Math.exp(b * (sStress - sUse));
        }
        return af;
    },

    // ─── Norris-Landzberg ───
    // AF = (fu/fs)^n1 * (ΔTs/ΔTu)^m * Arrhenius(Tmax)
    // Ref: Norris & Landzberg (1969); IPC-9701A
    calcNorrisLandzberg(m, fUse, fStress, dtUse, dtStress, tMaxUse, tMaxStress, ea = 0.123) {
        const n1 = 0.33;
        const afFreq = Math.pow(fUse / fStress, n1);
        const afDt = Math.pow(dtStress / dtUse, m);
        const afT = this.calcArrhenius(ea, tMaxUse, tMaxStress);
        return afFreq * afDt * afT;
    },

    // ─── 복합: 아레니우스 × 역거듭제곱 ───
    // Ref: JEDEC JESD91A, Section 3.5
    calcArrheniusPower(ea, n, tUse, tStress, vUse, vStress) {
        return this.calcArrhenius(ea, tUse, tStress) * this.calcInversePower(n, vUse, vStress);
    },

    // ─── 시험 시간 vs 시료수 트레이드오프 ───
    // T_test = (L_target / AF) * [ln(1-C) / (n * ln(R))]^(1/β)
    // Ref: Meeker & Escobar (1998), Ch. 16
    calcTradeoff(af, beta, targetLife, targetReliability = 0.9, confidence = 0.9) {
        const ln1C = Math.log(1 - confidence);
        const lnR = Math.log(targetReliability);
        const data = [];

        for (let n = 1; n <= 50; n++) {
            const term = ln1C / (n * lnR);
            if (term <= 0) { data.push({ n, time: 0 }); continue; }
            const tReq = (targetLife / af) * Math.pow(term, 1 / beta);
            data.push({ n, time: parseFloat(tReq.toFixed(1)) });
        }
        return data;
    },

    // ─── 가속 모델 및 보증수명 계산 과정 수식 상세 생성 ───
    getGeneralFormula(model, afParams, af, beta, n, targetLife, confidence, targetBx, goal, tTestUser) {
        const C = confidence / 100;
        const bxFraction = targetBx / 100;
        let steps = '';

        // 1. AF 계산 상세 단계 생성
        let afFormulaStr = '';
        let modelLabel = '';
        const k = this.K; // 8.617333e-5
        
        if (model === 'arrhenius') {
            modelLabel = 'Arrhenius (온도)';
            const { ea, tUse, tStress } = afParams;
            const Tu = tUse + 273.15;
            const Ts = tStress + 273.15;
            const tempDiff = (1 / Tu) - (1 / Ts);
            const eaOverK = ea / k;
            const exponent = eaOverK * tempDiff;
            
            afFormulaStr = `\\begin{aligned}
            AF_{Arr} &= \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right] \\\\
            &= \\exp\\left[ \\frac{${ea}\\text{ eV}}{8.6173 \\times 10^{-5}\\text{ eV/K}} \\left( \\frac{1}{${tUse}\\text{°C} + 273.15} - \\frac{1}{${tStress}\\text{°C} + 273.15} \\right) \\right] \\\\
            &= \\exp\\left[ ${eaOverK.toFixed(2)}\\text{ K} \\left( \\frac{1}{${Tu.toFixed(2)}\\text{ K}} - \\frac{1}{${Ts.toFixed(2)}\\text{ K}} \\right) \\right] \\\\
            &= \\exp\\left[ ${eaOverK.toFixed(2)} \\left( ${tempDiff.toExponential(6)} \\right) \\right] \\\\
            &= \\exp\\left[ ${exponent.toFixed(6)} \\right] = ${af.toFixed(4)}
            \\end{aligned}`;
        } else if (model === 'peck') {
            modelLabel = 'Peck (온도+습도)';
            const { ea, nPeck, tUse, rhUse, tStress, rhStress } = afParams;
            const Tu = tUse + 273.15;
            const Ts = tStress + 273.15;
            const tempDiff = (1 / Tu) - (1 / Ts);
            const eaOverK = ea / k;
            const exponent = eaOverK * tempDiff;
            const afT = Math.exp(exponent);
            const rhRatio = rhStress / rhUse;
            const afRH = Math.pow(rhRatio, nPeck);
            
            afFormulaStr = `\\begin{aligned}
            AF_{Peck} &= \\left( \\frac{RH_{stress}}{RH_{use}} \\right)^n \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right] \\\\
            &= \\left( \\frac{${rhStress}\\%}{${rhUse}\\%} \\right)^{${nPeck}} \\exp\\left[ \\frac{${ea}}{8.6173 \\times 10^{-5}} \\left( \\frac{1}{${tUse} + 273.15} - \\frac{1}{${tStress} + 273.15} \\right) \\right] \\\\
            &= \\left( ${rhRatio.toFixed(4)} \\right)^{${nPeck}} \\times \\exp\\left[ ${eaOverK.toFixed(2)} \\left( \\frac{1}{${Tu.toFixed(2)}} - \\frac{1}{${Ts.toFixed(2)}} \\right) \\right] \\\\
            &= ${afRH.toFixed(4)} \\times \\exp\\left[ ${exponent.toFixed(6)} \\right] \\\\
            &= ${afRH.toFixed(4)} \\times ${afT.toFixed(4)} = ${af.toFixed(4)}
            \\end{aligned}`;
        } else if (model === 'coffin_manson') {
            modelLabel = 'Coffin-Manson (열사이클)';
            const { m, dtUse, dtStress } = afParams;
            const ratio = dtStress / dtUse;
            
            afFormulaStr = `\\begin{aligned}
            AF_{CM} &= \\left( \\frac{\\Delta T_{stress}}{\\Delta T_{use}} \\right)^m \\\\
            &= \\left( \\frac{${dtStress}\\text{°C}}{${dtUse}\\text{°C}} \\right)^{${m}} \\\\
            &= \\left( ${ratio.toFixed(4)} \\right)^{${m}} = ${af.toFixed(4)}
            \\end{aligned}`;
        } else if (model === 'inverse_power') {
            modelLabel = 'Inverse Power Law (역거듭제곱)';
            const { n: nPower, vUse, vStress } = afParams;
            const ratio = vStress / vUse;
            
            afFormulaStr = `\\begin{aligned}
            AF_{IPL} &= \\left( \\frac{V_{stress}}{V_{use}} \\right)^n \\\\
            &= \\left( \\frac{${vStress}}{${vUse}} \\right)^{${nPower}} \\\\
            &= \\left( ${ratio.toFixed(4)} \\right)^{${nPower}} = ${af.toFixed(4)}
            \\end{aligned}`;
        } else if (model === 'eyring') {
            modelLabel = 'Eyring (온도+비열)';
            const { ea, tUse, tStress, b, sUse, sStress } = afParams;
            const Tu = tUse + 273.15;
            const Ts = tStress + 273.15;
            const tempDiff = (1 / Tu) - (1 / Ts);
            const eaOverK = ea / k;
            const tRatio = Tu / Ts;
            const afT = Math.exp(eaOverK * tempDiff);
            const stressDiff = sStress - sUse;
            const stressTermVal = Math.exp(b * stressDiff);
            
            if (b !== 0 && sUse > 0 && sStress > 0) {
                afFormulaStr = `\\begin{aligned}
                AF_{Eyring} &= \\left( \\frac{T_{use}}{T_{stress}} \\right) \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right] \\exp\\left[ B (S_{stress} - S_{use}) \\right] \\\\
                &= \\left( \\frac{${Tu.toFixed(2)}}{${Ts.toFixed(2)}} \\right) \\exp\\left[ ${eaOverK.toFixed(2)} \\left( \\frac{1}{${Tu.toFixed(2)}} - \\frac{1}{${Ts.toFixed(2)}} \\right) \\right] \\exp\\left[ ${b} \\times (${sStress} - ${sUse}) \\right] \\\\
                &= ${tRatio.toFixed(4)} \\times ${afT.toFixed(4)} \\times \\exp\\left[ ${(b * stressDiff).toFixed(4)} \\right] \\\\
                &= ${tRatio.toFixed(4)} \\times ${afT.toFixed(4)} \\times ${stressTermVal.toFixed(4)} = ${af.toFixed(4)}
                \\end{aligned}`;
            } else {
                afFormulaStr = `\\begin{aligned}
                AF_{Eyring} &= \\left( \\frac{T_{use}}{T_{stress}} \\right) \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right] \\\\
                &= \\left( \\frac{${Tu.toFixed(2)}}{${Ts.toFixed(2)}} \\right) \\exp\\left[ ${eaOverK.toFixed(2)} \\left( \\frac{1}{${Tu.toFixed(2)}} - \\frac{1}{${Ts.toFixed(2)}} \\right) \\right] \\\\
                &= ${tRatio.toFixed(4)} \\times ${afT.toFixed(4)} = ${af.toFixed(4)}
                \\end{aligned}`;
            }
        } else if (model === 'norris_landzberg') {
            modelLabel = 'Norris-Landzberg';
            const { m, fUse, fStress, dtUse, dtStress, tMaxUse, tMaxStress, ea } = afParams;
            const TuMax = tMaxUse + 273.15;
            const TsMax = tMaxStress + 273.15;
            const tempDiff = (1 / TuMax) - (1 / TsMax);
            const eaOverK = ea / k;
            
            const afFreq = Math.pow(fUse / fStress, 0.33);
            const afDt = Math.pow(dtStress / dtUse, m);
            const afT = Math.exp(eaOverK * tempDiff);
            
            afFormulaStr = `\\begin{aligned}
            AF_{NL} &= \\left( \\frac{f_{use}}{f_{stress}} \\right)^{0.33} \\left( \\frac{\\Delta T_{stress}}{\\Delta T_{use}} \\right)^m \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{max,use}} - \\frac{1}{T_{max,stress}} \\right) \\right] \\\\
            &= \\left( \\frac{${fUse}}{${fStress}} \\right)^{0.33} \\left( \\frac{${dtStress}}{${dtUse}} \\right)^{${m}} \\exp\\left[ \\frac{${ea}}{8.6173 \\times 10^{-5}} \\left( \\frac{1}{${tMaxUse} + 273.15} - \\frac{1}{${tMaxStress} + 273.15} \\right) \\right] \\\\
            &= \\left( ${(fUse/fStress).toFixed(4)} \\right)^{0.33} \\times \\left( ${(dtStress/dtUse).toFixed(4)} \\right)^{${m}} \\times \\exp\\left[ ${eaOverK.toFixed(2)} \\left( \\frac{1}{${TuMax.toFixed(2)}} - \\frac{1}{${TsMax.toFixed(2)}} \\right) \\right] \\\\
            &= ${afFreq.toFixed(4)} \\times ${afDt.toFixed(4)} \\times \\exp\\left[ ${(eaOverK * tempDiff).toFixed(6)} \\right] \\\\
            &= ${afFreq.toFixed(4)} \\times ${afDt.toFixed(4)} \\times ${afT.toFixed(4)} = ${af.toFixed(4)}
            \\end{aligned}`;
        } else if (model === 'arrhenius_power') {
            modelLabel = '복합 (Arrhenius × IPL)';
            const { ea, n: nPower, tUse, tStress, vUse, vStress } = afParams;
            const Tu = tUse + 273.15;
            const Ts = tStress + 273.15;
            const tempDiff = (1 / Tu) - (1 / Ts);
            const eaOverK = ea / k;
            
            const afT = Math.exp(eaOverK * tempDiff);
            const afV = Math.pow(vStress / vUse, nPower);
            
            afFormulaStr = `\\begin{aligned}
            AF_{combo} &= AF_{Arr} \\times AF_{IPL} \\\\
            &= \\exp\\left[ \\frac{E_a}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right] \\times \\left( \\frac{V_{stress}}{V_{use}} \\right)^n \\\\
            &= \\exp\\left[ \\frac{${ea}}{8.6173 \\times 10^{-5}} \\left( \\frac{1}{${tUse} + 273.15} - \\frac{1}{${tStress} + 273.15} \\right) \\right] \\times \\left( \\frac{${vStress}}{${vUse}} \\right)^{${nPower}} \\\\
            &= \\exp\\left[ ${eaOverK.toFixed(2)} \\left( \\frac{1}{${Tu.toFixed(2)}} - \\frac{1}{${Ts.toFixed(2)}} \\right) \\right] \\times \\left( ${(vStress/vUse).toFixed(4)} \\right)^{${nPower}} \\\\
            &= ${afT.toFixed(4)} \\times ${afV.toFixed(4)} = ${af.toFixed(4)}
            \\end{aligned}`;
        }

        steps += FormulaRenderer.step(`1. 가속 계수 (AF) 상세 계산 과정 - ${modelLabel}`, afFormulaStr);

        const chi2 = jStat.chisquare.inv(C, 2);
        
        if (!goal || goal === 'test_time') {
            // 2. 필요 시험 시간
            const etaUseReq = targetLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            const tTest = (1 / af) * Math.pow((chi2 * Math.pow(etaUseReq, beta)) / (2 * Math.max(n, 1)), 1 / beta);
            const tTestFinal = Math.max(1, Math.round(tTest));

            steps += FormulaRenderer.step('2. 필요 시험 시간(t_{test}) 계산',
                `t_{test} = \\frac{1}{AF} \\left( \\frac{\\chi^2 \\cdot \\eta_{use,req}^{\\beta}}{2n} \\right)^{1/\\beta} = \\frac{1}{${af.toFixed(4)}} \\left( \\frac{${chi2.toFixed(4)} \\cdot ${Math.round(etaUseReq).toLocaleString()}^${beta}}{2 \\cdot ${n}} \\right)^{1/${beta}} = ${tTestFinal.toLocaleString()}\\text{시간}`
            );

            // 3. 척도모수
            const etaUse = Math.pow((2 * Math.pow(tTestFinal * af, beta) * Math.max(n, 1)) / chi2, 1 / beta);
            steps += FormulaRenderer.step('3. 최종 척도모수(\\eta_{use}) 계산',
                `\\eta_{use} = \\left( \\frac{2 n \\cdot (t_{test} \\cdot AF)^{\\beta}}{\\chi^2} \\right)^{1/\\beta} = \\left( \\frac{2 \\cdot ${n} \\cdot (${tTestFinal} \\cdot ${af.toFixed(4)})^${beta}}{${chi2.toFixed(4)}} \\right)^{1/${beta}} = ${Math.round(etaUse).toLocaleString()}\\text{시간}`
            );

            // 4. 보증 수명
            const bxLife = etaUse * Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            steps += FormulaRenderer.step(`4. 보증 수명(B_{${targetBx}} Life) 계산`,
                `B_{${targetBx}} = \\eta_{use} \\cdot [-\\ln(1-F_x)]^{1/\\beta} = ${Math.round(etaUse).toLocaleString()} \\cdot [-\\ln(1-${bxFraction})]^{1/${beta}} = ${Math.round(bxLife).toLocaleString()}\\text{시간}`
            );
        } else if (goal === 'sample_size') {
            const etaUseReq = targetLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            const num = chi2 * Math.pow(etaUseReq, beta);
            const den = 2 * Math.pow(tTestUser * af, beta);
            const nReq = Math.ceil(num / den);
            
            steps += FormulaRenderer.step(`2. 목표 척도모수(\\eta_{use,req}) 계산 (B_{${targetBx}} = ${targetLife.toLocaleString()}\\text{시간})`,
                `\\eta_{use,req} = \\frac{B_x}{[-\\ln(1-F_x)]^{1/\\beta}} = \\frac{${targetLife}}{[-\\ln(1-${bxFraction})]^{1/${beta}}} = ${Math.round(etaUseReq).toLocaleString()}\\text{시간}`
            );
            steps += FormulaRenderer.step('3. 필요 시료 수(n) 계산',
                `n_{req} = \\lceil \\frac{\\chi^2 \\cdot \\eta_{use,req}^{\\beta}}{2 (t_{test} \\cdot AF)^{\\beta}} \\rceil = \\lceil \\frac{${chi2.toFixed(4)} \\cdot ${Math.round(etaUseReq).toLocaleString()}^${beta}}{2 \\cdot (${tTestUser} \\cdot ${af.toFixed(4)})^${beta}} \\rceil = ${nReq}\\text{개}`
            );
        } else if (goal === 'life') {
            const certifiedLife = af * tTestUser * Math.pow(-Math.log(1 - bxFraction), 1/beta) / Math.pow(chi2/(2 * Math.max(n, 1)), 1/beta);
            steps += FormulaRenderer.step(`2. 보증 가능 수명(B_{${targetBx}}) 계산`,
                `B_{${targetBx},cert} = \\frac{AF \\cdot t_{test} \\cdot [-\\ln(1-F_x)]^{1/\\beta}}{(\\chi^2 / 2n)^{1/\\beta}} = \\frac{${af.toFixed(4)} \\cdot ${tTestUser} \\cdot [-\\ln(1-${bxFraction})]^{1/${beta}}}{(${chi2.toFixed(4)} / ${2*n})^{1/${beta}}} = ${Math.round(certifiedLife).toLocaleString()}\\text{시간}`
            );
            const etaUse = Math.round(certifiedLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta));
            steps += FormulaRenderer.step('3. 도출된 척도모수(\\eta_{use})',
                `\\eta_{use} = \\frac{B_{x,cert}}{[-\\ln(1-F_x)]^{1/\\beta}} = ${etaUse.toLocaleString()}\\text{시간}`
            );
        }

        return { steps };
    },

    // ─── AF vs 스트레스 시각화 데이터 생성 ───
    // 온도, 습도, 전압 등 스트레스 범위에 따른 AF 곡선
    generateAFvsStress(model, params) {
        const data = [];
        if (model === 'arrhenius' || model === 'eyring') {
            const tUse = params.tUse || 25;
            const tStress = params.tStress || 85;
            const tMin = Math.max(0, Math.floor(tUse / 10) * 10);
            const tMax = Math.ceil((tStress * 1.2) / 10) * 10;
            const step = (tMax - tMin) > 100 ? 10 : 5;
            for (let t = tMin; t <= tMax; t += step) {
                const af = model === 'arrhenius'
                    ? this.calcArrhenius(params.ea, tUse, t)
                    : this.calcEyring(params.ea, tUse, t, params.b || 0, params.sUse || 0, params.sStress || 0);
                data.push({ stress: t, af: parseFloat(af.toFixed(3)), label: `${t}°C` });
            }
        } else if (model === 'peck') {
            const rhUse = params.rhUse || 60;
            const rhStress = params.rhStress || 85;
            const rhMin = Math.max(10, Math.floor(rhUse / 10) * 10);
            const rhMax = Math.min(100, Math.ceil((rhStress * 1.2) / 10) * 10);
            const step = (rhMax - rhMin) > 50 ? 5 : 2;
            for (let rh = rhMin; rh <= rhMax; rh += step) {
                const af = this.calcPeck(params.ea, params.nPeck, params.tUse, rhUse, params.tStress, rh);
                data.push({ stress: rh, af: parseFloat(af.toFixed(3)), label: `${rh}%RH` });
            }
        } else if (model === 'coffin_manson' || model === 'norris_landzberg') {
            const dtUse = params.dtUse || 20;
            const dtStress = params.dtStress || 100;
            const dtMin = Math.max(5, Math.floor(dtUse / 10) * 10);
            const dtMax = Math.ceil((dtStress * 1.2) / 10) * 10;
            const step = (dtMax - dtMin) > 100 ? 10 : 5;
            for (let dt = dtMin; dt <= dtMax; dt += step) {
                const af = model === 'coffin_manson'
                    ? this.calcCoffinManson(params.m, dtUse, dt)
                    : this.calcNorrisLandzberg(params.m, params.fUse, params.fStress, dtUse, dt, params.tMaxUse, params.tMaxStress || dt, params.ea);
                data.push({ stress: dt, af: parseFloat(af.toFixed(3)), label: `ΔT=${dt}°C` });
            }
        } else if (model === 'inverse_power') {
            const vUse = params.vUse || 5;
            const vStress = params.vStress || 12;
            const vMin = Math.max(0.1, Math.floor(vUse));
            const vMax = Math.ceil((vStress * 1.2) * 10) / 10;
            const step = (vMax - vMin) > 20 ? 1.0 : (vMax - vMin) > 5 ? 0.5 : 0.1;
            for (let v = vMin; v <= vMax; v += step) {
                const af = this.calcInversePower(params.n, vUse, v);
                data.push({ stress: parseFloat(v.toFixed(2)), af: parseFloat(af.toFixed(3)), label: `${v.toFixed(1)}` });
            }
        } else if (model === 'arrhenius_power') {
            const tUse = params.tUse || 25;
            const tStress = params.tStress || 85;
            const tMin = Math.max(0, Math.floor(tUse / 10) * 10);
            const tMax = Math.ceil((tStress * 1.2) / 10) * 10;
            const step = (tMax - tMin) > 100 ? 10 : 5;
            for (let t = tMin; t <= tMax; t += step) {
                const af = this.calcArrheniusPower(params.ea, params.n, tUse, t, params.vUse, params.vStress);
                data.push({ stress: t, af: parseFloat(af.toFixed(3)), label: `${t}°C` });
            }
        }
        return data;
    },

    // ─── 가속 모델 파라미터 학술 및 규격 레퍼런스 데이터 ───
    // Ref: JEDEC, IEC, IPC, MIL-HDBK 등 국제 규격 및 주요 대표 논문 근거
    REFERENCE_DATA: {
        arrhenius: {
            title: "Arrhenius (온도) 모델 레퍼런스 & 검증",
            modelName: "Arrhenius (온도)",
            parameters: [
                { symbol: "Ea = 0.7 eV", name: "반도체 소자 마모", range: "0.6 ~ 0.8 eV", source: "JEDEC JESD91A / MIL-338B", details: "HTOL 설계 시 반도체 소자 고온 마모 수명 평가 기본값" },
                { symbol: "Ea = 0.9 eV", name: "패키지 알루미늄 부식", range: "0.8 ~ 1.0 eV", source: "JESD22-A110 / Peck(1986)", details: "HAST(고온고습) 시험 시 패키지 수분 유입 및 전극 부식 평가" },
                { symbol: "Ea = 0.5 eV", name: "솔더 조인트 크리프", range: "0.5 ~ 0.6 eV", source: "IPC-9701A / Meeker", details: "HTSL(고온저장) 시 접합부 IMC 성장 및 피로 수명 단축" },
                { symbol: "Ea = 0.6 eV", name: "일렉트로마이그레이션", range: "0.5 ~ 0.7 eV", source: "JEDEC JESD63 / Black(1969)", details: "고전류 노출 시 배선 원자 이동으로 인한 보이드 단선 가속" },
                { symbol: "Ea = 1.0 eV", name: "게이트 산화막 파괴(TDDB)", range: "1.0 ~ 1.4 eV", source: "JEDEC JESD92 / Intel Manual", details: "초미세 절연막(SiO2/High-k)의 열적 내재성 절연 파괴" },
                { symbol: "Ea = 0.98 eV", name: "콘덴서 수명 열화", range: "0.94 ~ 1.0 eV", source: "MIL-HDBK-217F / 제조사 가이드", details: "10°C 법칙(온도 10°C 상승 시 수명 50% 단축) 경험칙 모사" }
            ],
            verification: {
                source: "JEDEC JESD22-A108D (Temperature bias stress life test)",
                scenario: "사용 온도 55°C, 가속 시험 온도 125°C, 활성화 에너지 Ea = 0.7 eV 조건",
                inputs: { useTemp: 55, stressTemp: 125, ea: 0.7 },
                targetVal: 77.65,
                formula: "AF = \\exp\\left( \\frac{0.7}{8.6173 \\times 10^{-5}} \\left( \\frac{1}{328.15} - \\frac{1}{398.15} \\right) \\right)",
                setInputsFunc: "applyVerificationInputs('arrhenius', { 'acc-t-use': 55, 'acc-t-stress': 125, 'acc-ea': 0.7 })"
            }
        },
        peck: {
            title: "Peck (온도+습도) 모델 레퍼런스 & 검증",
            modelName: "Peck (온도+습도)",
            parameters: [
                { symbol: "Ea = 0.9 eV", name: "수분 부식 활성화 에너지", range: "0.7 ~ 0.9 eV", source: "JESD22-A110 / Peck(1986)", details: "HAST/고온고습 시험 시 부식 화학반응의 온도 가속 요소" },
                { symbol: "n = 3.0", name: "습도 가속 지수 표준", range: "2.7 ~ 3.0", source: "Peck(1986) / JEDEC JESD91A", details: "에폭시 패키지의 수분 침투 및 전극 부식 표준 가속 상수" },
                { symbol: "n = 4.0", name: "고습도 민감 부품 가속", range: "3.5 ~ 4.5", source: "NASA-TM-2018-219770", details: "센서류 및 보호막 결함부의 고가속 습도 평가 기준" }
            ],
            verification: {
                source: "Peck, D. S. (1986) IEEE IRPS 논문 검증 사례",
                scenario: "사용 30°C / 60%RH, 스트레스 85°C / 85%RH, Ea = 0.9 eV, 습도지수 n = 3.0",
                inputs: { useTemp: 30, useRh: 60, stressTemp: 85, stressRh: 85, ea: 0.9, n: 3.0 },
                targetVal: 564.57,
                formula: "AF = \\left(\\frac{85}{60}\\right)^{3} \\cdot \\exp\\left( \\frac{0.9}{k} \\left( \\frac{1}{303.15} - \\frac{1}{358.15} \\right) \\right)",
                setInputsFunc: "applyVerificationInputs('peck', { 'acc-t-use': 30, 'acc-t-stress': 85, 'acc-ea': 0.9, 'acc-rh-use': 60, 'acc-rh-stress': 85, 'acc-n-peck': 3.0 })"
            }
        },
        coffin_manson: {
            title: "Coffin-Manson (열 사이클) 모델 레퍼런스 & 검증",
            modelName: "Coffin-Manson (열사이클)",
            parameters: [
                { symbol: "m = 1.9", name: "유연 솔더 접합부 피로", range: "1.8 ~ 2.0", source: "IPC-9701A / Coffin(1954)", details: "SnPb 솔더 접합부의 CTE 불일치 열피로 수명 기초값" },
                { symbol: "m = 2.2", name: "무연 솔더 접합부 피로", range: "2.1 ~ 2.5", source: "IPC-9701A / JEDEC JESD91A", details: "무연 솔더(SAC305) 접합부의 열피로 수명 설계 표준값" },
                { symbol: "m = 3.5", name: "도선 및 와이어 본딩 피로", range: "3.0 ~ 4.0", source: "MIL-338B / NASA Guidelines", details: "IC 본딩 와이어(Al/Au/Cu) 접합부의 열순환 반복 응력 피로 가속" },
                { symbol: "m = 6.0", name: "유리 및 세라믹 계면 파손", range: "5.0 ~ 8.0", source: "Intel Reliability Report", details: "세라믹 기판 다이 균열 및 유리 밀봉부의 급격한 열피로 파괴" }
            ],
            verification: {
                source: "IPC-9701A (Performance Test Methods for Solder Attachments)",
                scenario: "사용 온도 폭 ΔTu = 20°C, 시험 온도 폭 ΔTs = 100°C, 피로지수 m = 1.9 조건",
                inputs: { dtUse: 20, dtStress: 100, m: 1.9 },
                targetVal: 21.27,
                formula: "AF = \\left(\\frac{100}{20}\\right)^{1.9}",
                setInputsFunc: "applyVerificationInputs('coffin_manson', { 'acc-dt-use': 20, 'acc-dt-stress': 100, 'acc-m': 1.9 })"
            }
        },
        inverse_power: {
            title: "Inverse Power Law (전압/전류/하중) 모델 레퍼런스 & 검증",
            modelName: "Inverse Power Law",
            parameters: [
                { symbol: "n = 8.0", name: "게이트 유전막 절연 파괴", range: "7.0 ~ 9.0", source: "JEDEC JESD92 / Intel Manual", details: "극박막 게이트 산화막(SiO2) 고전압 바이어스 가속 시험용" },
                { symbol: "n = 1.5", name: "일렉트로마이그레이션 전류", range: "1.0 ~ 2.0", source: "JEDEC JESD63 / Black(1969)", details: "Black EM 공식 전류 지수 (Void 성장 1.5, 줄열 파괴 2.0)" },
                { symbol: "n = 6.0", name: "세라믹 커패시터 전압 지수", range: "5.0 ~ 8.0", source: "MIL-217F / Murata Tech Bulletin", details: "MLCC 누설 전류 가속 및 수명 보증용 표준 전압 지수" },
                { symbol: "n = 3.0", name: "볼베어링 동적 하중 가속", range: "3.0", source: "ISO 281 / SKF Guide", details: "회전체 기계적 접촉 피로 수명(L10) 가속 (롤러 베어링: 3.33)" }
            ],
            verification: {
                source: "JEDEC JESD92 (TDDB Characterization Standard)",
                scenario: "사용 전압 Vu = 3.3V, 시험 가속 전압 Vs = 5.0V, 전압 가속지수 n = 7.0 조건",
                inputs: { vUse: 3.3, vStress: 5.0, n: 7.0 },
                targetVal: 18.26,
                formula: "AF = \\left(\\frac{5.0}{3.3}\\right)^7",
                setInputsFunc: "applyVerificationInputs('inverse_power', { 'acc-v-use': 3.3, 'acc-v-stress': 5.0, 'acc-n-power': 7.0 })"
            }
        },
        eyring: {
            title: "Eyring (온도+비열스트레스) 모델 레퍼런스 & 검증",
            modelName: "Eyring (온도+비열스트레스)",
            parameters: [
                { symbol: "B = 0.5 ~ 2.0", name: "반도체 소자 전압 스트레스 계수", range: "0.5 ~ 2.0", source: "JEDEC JEP122G / JESD91A", details: "TDDB 등 전압 가속 시험 시 비열 스트레스(전압) 가속 상수" },
                { symbol: "B = 0.044", name: "패키지 상대습도 가속 계수", range: "0.03 ~ 0.05", source: "Peck(1986) / MIL-HDBK-338B", details: "HAST 습도 가속을 Eyring 지수형으로 근사할 때의 대표 계수" },
                { symbol: "Ea = 0.7 eV", name: "반도체 소자 열 활성화 에너지", range: "0.5 ~ 0.9 eV", source: "JEDEC JESD91A / MIL-338B", details: "Eyring 모델 내의 기본 열 가속 활성화 에너지" }
            ],
            verification: {
                source: "JEP122G (Failure Mechanisms and Models for Semiconductor Devices)",
                scenario: "사용 55°C / 1.0V, 가속 125°C / 1.5V, Ea = 0.7 eV, 비열 스트레스 계수 B = 1.2 조건",
                inputs: { useTemp: 55, stressTemp: 125, ea: 0.7, b: 1.2, useS: 1.0, stressS: 1.5 },
                targetVal: 116.6167,
                formula: "AF = \\frac{T_{use}}{T_{stress}} \\cdot \\exp\\left( \\frac{0.7}{k} \\left( \\frac{1}{T_{use}} - \\frac{1}{T_{stress}} \\right) \\right) \\cdot \\exp\\left( 1.2 \\cdot (S_{stress} - S_{use}) \\right)",
                setInputsFunc: "applyVerificationInputs('eyring', { 'acc-t-use': 55, 'acc-t-stress': 125, 'acc-ea': 0.7, 'acc-eyring-b': 1.2, 'acc-eyring-s-use': 1.0, 'acc-eyring-s-stress': 1.5 })"
            }
        },
        norris_landzberg: {
            title: "Norris-Landzberg (열 사이클 및 주파수) 모델 레퍼런스 & 검증",
            modelName: "Norris-Landzberg (열사이클)",
            parameters: [
                { symbol: "m = 1.9", name: "SnPb 솔더 접합부 피로", range: "1.8 ~ 2.0", source: "IPC-9701A / Norris(1969)", details: "SnPb 공정 접합부의 열피로 지수 기본값" },
                { symbol: "m = 2.2", name: "SAC305 무연 솔더 피로", range: "2.1 ~ 2.5", source: "JEDEC JESD91A / IPC-9701A", details: "SAC305 등 무연 합금 접합부의 온도 순환 가속 지수" },
                { symbol: "Ea = 0.123 eV", name: "솔더 열 피로 활성화 에너지", range: "0.12 ~ 0.13 eV", source: "IPC-9701A / Norris-Landzberg", details: "온도 순환 피로 수명 산정의 최고 온도 보정 활성화 에너지" }
            ],
            verification: {
                source: "IPC-9701A (Performance Test Methods for Solder Attachments)",
                scenario: "사용 ΔTu=20°C / fu=1 cpd / Tu_max=50°C, 가속 ΔTs=100°C / fs=24 cpd / Ts_max=125°C, m=1.9, Ea=0.123 eV",
                inputs: { m: 1.9, fUse: 1.0, fStress: 24.0, dtUse: 20, dtStress: 100, tMaxUse: 50, tMaxStress: 125, ea: 0.123 },
                targetVal: 17.1150,
                formula: "AF = \\left(\\frac{f_{use}}{f_{stress}}\\right)^{0.33} \\cdot \\left(\\frac{\\Delta T_{stress}}{\\Delta T_{use}}\\right)^m \\cdot \\exp\\left( \\frac{E_a}{k} \\left( \\frac{1}{T_{max, use}} - \\frac{1}{T_{max, stress}} \\right) \\right)",
                setInputsFunc: "applyVerificationInputs('norris_landzberg', { 'acc-dt-use': 20, 'acc-dt-stress': 100, 'acc-m': 1.9, 'acc-nl-rampup-use': 360, 'acc-nl-dwellhigh-use': 360, 'acc-nl-rampdown-use': 360, 'acc-nl-dwelllow-use': 360, 'acc-nl-rampup-stress': 30, 'acc-nl-dwellhigh-stress': 30, 'acc-nl-rampdown-stress': 30, 'acc-nl-dwelllow-stress': 30, 'acc-nl-tmax-use': 50, 'acc-nl-tmax-stress': 125, 'acc-nl-ea': 0.123 })"
            }
        }
    }
};
