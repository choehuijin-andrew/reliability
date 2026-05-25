/**
 * RE-Suite Static — 스마트 클립보드/엑셀 데이터 파서
 * Ref: ISO 2859-1 & Weibull++ 표준 데이터 가공 패턴 호환
 */
const SmartParser = {
    /**
     * 클립보드 텍스트를 파싱하여 행과 헤더를 추출
     * @param {string} text 
     * @returns {{ headers: string[]|null, rows: any[][] }}
     */
    parse(text) {
        if (!text || typeof text !== 'string') {
            return { headers: null, rows: [] };
        }

        // 1. 줄 분리 (빈 줄 제거)
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length === 0) {
            return { headers: null, rows: [] };
        }

        // 2. 구분자 자동 감지 (\t -> , -> ; -> 공백)
        let delimiter = '\t';
        const delimiters = ['\t', ',', ';', ' '];
        let maxCols = 0;
        
        for (const delim of delimiters) {
            const cols = lines[0].split(delim).length;
            if (cols > maxCols) {
                maxCols = cols;
                delimiter = delim;
            }
        }

        // 3. 데이터 토큰화
        const parsedLines = lines.map(line => {
            if (delimiter === ' ') {
                return line.split(/\s+/);
            }
            return line.split(delimiter).map(cell => cell.trim());
        });

        // 4. 첫 행이 헤더인지 판정
        // 셀들 중 숫자가 아닌 비율이 50%를 초과하면 헤더로 간주
        const firstLine = parsedLines[0];
        let nonNumericCount = 0;
        for (const cell of firstLine) {
            if (cell === '' || isNaN(Number(cell))) {
                nonNumericCount++;
            }
        }

        let headers = null;
        let startIdx = 0;
        if (firstLine.length > 0 && (nonNumericCount / firstLine.length) > 0.5) {
            headers = firstLine;
            startIdx = 1;
        }

        // 5. 데이터 가공 및 표준 이벤트 매핑
        const rows = [];
        for (let i = startIdx; i < parsedLines.length; i++) {
            const rawRow = parsedLines[i];
            const processedRow = rawRow.map(cell => {
                if (cell === '') return null;
                
                // 숫자로 변환 가능하면 변환
                if (!isNaN(Number(cell))) {
                    return Number(cell);
                }
                
                // 이벤트 변환
                const lowerCell = cell.toLowerCase();
                const failTerms = ['f', 'failed', '고장', '1', 'fail', 'f.'];
                const censorTerms = ['c', 'censored', '중단', '0', 'c.', 's', 'suspended', 'cens', '중지'];
                
                if (failTerms.includes(lowerCell)) return 'F';
                if (censorTerms.includes(lowerCell)) return 'C';
                
                return cell; // 변환 실패 시 원본 문자열 유지
            });
            rows.push(processedRow);
        }

        return { headers, rows };
    }
};
