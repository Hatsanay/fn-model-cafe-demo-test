// config อยู่ใน config.js — โหลดก่อน script.js ใน index.html
let reportData = JSON.parse(localStorage.getItem('fn_report')) || { totalClients: 0, countA: 0, countB: 0, countC: 0, incomeA: 0, incomeB: 0, incomeC: 0, totalTimeMs: 0, grandTotal: 0, cashTotal: 0, transferTotal: 0 };
let transactionLogs = JSON.parse(localStorage.getItem('fn_logs')) || [];
let monthlyHistory = JSON.parse(localStorage.getItem('fn_monthly_history')) || [];
let timers = [];
let dailyExpenses = [];
let basket = [];
let basketPayType = null;
let cdPackages = [];
let _cdModalTimerId = null;
let _cdModalMode = 'start';
let _cdAudioQueue = [];
let _cdAudioBusy = false;
let _cdAudio = null;
let _cdThaiVoice = null;
const _isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const _isSafari = _isIOS || /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function _detectThaiVoice() {
    const thai = speechSynthesis.getVoices().find(v => v.lang.startsWith('th'));
    _cdThaiVoice = thai || false;
}

function _createSilentWavUrl() {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * 0.1);
    const dataLen = numSamples * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const v = new DataView(buf);
    const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true);
    s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    s(36, 'data'); v.setUint32(40, dataLen, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function unlockAudio() {
    if (!_cdAudio) _cdAudio = document.createElement('audio');
    const url = _createSilentWavUrl();
    _cdAudio.src = url;
    _cdAudio.play().finally ? _cdAudio.play().finally(() => URL.revokeObjectURL(url))
                             : _cdAudio.play().then(() => URL.revokeObjectURL(url)).catch(() => URL.revokeObjectURL(url));
    document.getElementById('soundBanner').style.display = 'none';
}

window.addEventListener('load', () => {
    if (!(ENABLE_CD_SPEECH_ALERT || ENABLE_CD_SPEECH_TIMESUP)) return;
    _detectThaiVoice();
    speechSynthesis.addEventListener('voiceschanged', _detectThaiVoice);
    setTimeout(() => {
        document.getElementById('soundBanner').style.display = 'block';
    }, 500);
});
const container = document.getElementById('timerContainer');
const summaryContainer = document.getElementById('summaryContainer');
const nameContainer = document.getElementById('nameInputs');
const countInput = document.getElementById('timerCount');

function saveData() {
    localStorage.setItem('fn_timers', JSON.stringify(timers.map(t => ({ ...t, interval: null }))));
    localStorage.setItem('fn_report', JSON.stringify(reportData));
    localStorage.setItem('fn_logs', JSON.stringify(transactionLogs));
    localStorage.setItem('fn_monthly_history', JSON.stringify(monthlyHistory));
    localStorage.setItem('fn_count', countInput.value);
}

function renderLogs() {
    const logBody = document.getElementById('logBody');
    const logEmpty = document.getElementById('logEmpty');
    if (!transactionLogs || transactionLogs.length === 0) { logBody.innerHTML = ''; logEmpty.style.display = 'block'; return; }
    logEmpty.style.display = 'none';
    logBody.innerHTML = transactionLogs.map(log => {
        const payTypeBadge = log.payType === 'cash' ? '<span class="badge badge-cash">เงินสด</span>' : '<span class="badge badge-transfer">เงินโอน</span>';
        if (log.isBasket && log.items) {
            const subRows = log.items.map(item => `
                        <tr class="log-sub-row">
                            <td style="padding-left:28px; color:#888; font-size:0.85rem;">↳ ${item.name}</td>
                            <td></td>
                            <td><span class="highlight">${item.class}</span></td>
                            <td>${item.minutes} นาที</td>
                            <td></td>
                            <td style="color:#00e676; font-weight:bold;">${(item.originalAmount || item.amount).toLocaleString()}.-</td>
                            <td></td>
                        </tr>`).join('');
            const discountRow = (log.discount && log.discount > 0) ? `
                        <tr class="log-sub-row">
                            <td colspan="5" style="padding-left:28px; color:#f57c00; font-size:0.85rem;">💰 ส่วนลดจากแต้ม</td>
                            <td style="color:#f57c00; font-weight:bold;">-${log.discount.toLocaleString()}.-</td>
                            <td></td>
                        </tr>
                        <tr class="log-sub-row">
                            <td colspan="5" style="padding-left:28px; color:#f1c40f; font-size:0.85rem;">รวมชำระ</td>
                            <td style="color:#f1c40f; font-weight:bold;">${log.amount.toLocaleString()}.-</td>
                            <td></td>
                        </tr>` : '';
            return `
                        <tr class="log-basket-row" onclick="toggleLogExpand(${log.id})">
                            <td>${log.time}</td>
                            <td>🛒 ${log.name} <span class="log-expand-icon" id="log-icon-${log.id}">▶</span></td>
                            <td><span style="color:#888; font-size:0.85rem;">รวม</span></td>
                            <td>${log.duration} นาที</td>
                            <td>${payTypeBadge}</td>
                            <td style="color:#00e676; font-weight:bold;">${(log.amount || 0).toLocaleString()}.-</td>
                            <td style="text-align:center;"><button class="btn-delete-log" onclick="event.stopPropagation();deleteLogEntry(${log.id})">🗑️</button></td>
                        </tr>
                        <tr id="log-expand-${log.id}" class="log-expand-row">
                            <td colspan="7" style="padding:0;">
                                <table style="width:100%; border-collapse:collapse;">${subRows}${discountRow}</table>
                            </td>
                        </tr>`;
        }
        return `
                <tr>
                    <td>${log.time}</td><td>${log.name}</td><td><span class="highlight">${log.class}</span></td>
                    <td>${log.duration} นาที</td><td>${payTypeBadge}</td><td style="color: #00e676; font-weight: bold;">${(log.amount || 0).toLocaleString()}.-</td>
                    <td style="text-align: center;"><button class="btn-delete-log" onclick="deleteLogEntry(${log.id})">🗑️</button></td>
                </tr>`;
    }).join('');
}

function toggleLogExpand(logId) {
    const row = document.getElementById(`log-expand-${logId}`);
    const icon = document.getElementById(`log-icon-${logId}`);
    if (!row) return;
    const isOpen = row.classList.contains('open');
    row.style.display = isOpen ? 'none' : 'table-row';
    row.classList.toggle('open', !isOpen);
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
}

function createTimers(isLoad = false) {
    const count = isLoad ? (localStorage.getItem('fn_count') || 8) : parseInt(countInput.value);
    countInput.value = count; container.innerHTML = ''; summaryContainer.innerHTML = ''; nameContainer.innerHTML = '';
    const savedTimers = JSON.parse(localStorage.getItem('fn_timers'));
    timers.forEach(t => clearInterval(t.interval));
    timers = [];
    for (let i = 1; i <= count; i++) {
        let timerObj;
        if (isLoad && savedTimers && savedTimers[i - 1]) {
            timerObj = savedTimers[i - 1];
            if (timerObj.isRunning) {
                timerObj.startTime = Date.now() - timerObj.elapsed;
                timerObj.interval = setInterval(() => {
                    timerObj.elapsed = Date.now() - timerObj.startTime;
                    const el = document.getElementById(`display-${timerObj.id}`);
                    if (el) {
                        if (timerObj.cdPackage) {
                            el.textContent = formatCdDisplay(timerObj);
                            el.style.color = getCdColor(timerObj);
                        } else {
                            el.textContent = formatTime(timerObj.elapsed);
                        }
                    }
                    if (timerObj.cdPackage) {
                        checkCdAlert(timerObj);
                        checkCdTimesUp(timerObj);
                        const cardEl = document.getElementById(`card-${timerObj.id}`);
                        if (cardEl) {
                            const isOt = (timerObj.cdBaseSeconds || timerObj.cdPackage.package_seconds) * 1000 - timerObj.elapsed <= 0;
                            cardEl.classList.toggle('cd-overtime-blink', isOt);
                        }
                    }
                    saveData();
                }, 100);
            }
        } else { timerObj = { id: i, name: `โต๊ะที่ ${i}`, startTime: 0, elapsed: 0, isRunning: false, isFinished: false, interval: null, activeClass: null, summary: null, payType: null, orders: [] }; }
        timers.push(timerObj);
        const card = document.createElement('div'); card.id = `card-${i}`; card.className = 'timer-card';
        const sCard = document.createElement('div'); sCard.id = `summary-card-${i}`; sCard.className = 'summary-card';
        container.appendChild(card); summaryContainer.appendChild(sCard);
        renderTimerCard(card, timerObj); renderSummaryCard(sCard, timerObj);
        const nameDiv = document.createElement('div');
        nameDiv.innerHTML = `<label>[${i}]: </label><input type="text" value="${timerObj.name}" oninput="updateName(${i}, this.value)">`;
        nameContainer.appendChild(nameDiv);
    }
    updateReportUI(); renderLogs();
}

function renderTimerCard(card, timer) {
    // ─── Countdown นับถอยหลัง (กำลังทำงาน) ───────────────────────────────────
    if (timer.cdPackage && timer.isRunning) {
        const pkg = timer.cdPackage;
        const cdColor = getCdColor(timer);
        const baseMs = (timer.cdBaseSeconds || pkg.package_seconds) * 1000;
        const remaining = baseMs - timer.elapsed;
        const isOvertime = remaining < 0;
        const isNearEnd = !isOvertime && remaining <= pkg.package_alert_seconds * 1000;
        const statusText = isOvertime ? 'เกินเวลา' : isNearEnd ? '⚠ ใกล้หมดเวลา' : 'เวลาที่เหลือ';
        card.classList.toggle('cd-overtime-blink', isOvertime);
        card.innerHTML = `
            <div style="color:#888; font-size:0.9rem;">${timer.name}</div>
            <div class="cd-badge">⏱ Class ${pkg.package_class} · ${fmtBadgePkgs(pkg, timer.cdExtraPackages || [])}</div>
            <div class="timer-display" id="display-${timer.id}" style="color:${cdColor};">${formatCdDisplay(timer)}</div>
            <div style="font-size:0.75rem;color:${cdColor};text-align:center;margin-bottom:6px;">${statusText}</div>
            <div><button class="btn-stop" onclick="stopTimer(${timer.id})">หยุด</button></div>
            ${ENABLE_CD_EXTEND ? `<button class="btn-cd-extend" onclick="openCdExtendModal(${timer.id})">+ ซื้อเวลาเพิ่ม</button>` : ''}`;
        return;
    }

    // ─── Countdown หยุดชั่วคราว ───────────────────────────────────────────────
    if (timer.cdPackage && !timer.isRunning && !timer.isFinished && timer.elapsed > 0) {
        const pkg = timer.cdPackage;
        const cdColor = getCdColor(timer);
        const baseMs = (timer.cdBaseSeconds || pkg.package_seconds) * 1000;
        const remaining = baseMs - timer.elapsed;
        const isOvertime = remaining < 0;
        card.classList.toggle('cd-overtime-blink', isOvertime);
        card.innerHTML = `
            <div style="color:#888; font-size:0.9rem;">${timer.name}</div>
            <div class="cd-badge">⏱ Class ${pkg.package_class} · ${fmtBadgePkgs(pkg, timer.cdExtraPackages || [])}</div>
            <div class="timer-display" id="display-${timer.id}" style="color:${cdColor};">${formatCdDisplay(timer)}</div>
            <div style="font-size:0.75rem;color:${cdColor};text-align:center;margin-bottom:6px;">${isOvertime ? 'เกินเวลา' : 'หยุดชั่วคราว'}</div>
            <div class="button-group">
                <button class="btn-resume" onclick="startTimer(${timer.id})">เล่นต่อ</button>
                <button class="btn-clear" onclick="resetTimer(${timer.id})">เสร็จ</button>
            </div>
            ${ENABLE_CD_EXTEND ? `<button class="btn-cd-extend" onclick="openCdExtendModal(${timer.id})">+ ซื้อเวลาเพิ่ม</button>` : ''}`;
        return;
    }

    // ─── Timer ปกติ (นับขึ้น) ─────────────────────────────────────────────────
    card.classList.remove('cd-overtime-blink');
    let buttonHTML = '';
    if (timer.isFinished) { buttonHTML = `<div style="color: #f1c40f; padding: 10px; font-weight: bold; border: 1px dashed #f1c40f; border-radius: 6px; margin-top: 10px;">เช็คบิลแล้ว</div>`; }
    else if (timer.isRunning) { buttonHTML = `<button class="btn-stop" onclick="stopTimer(${timer.id})">หยุด</button>`; }
    else if (timer.elapsed > 0) { buttonHTML = `<div class="button-group"><button class="btn-resume" onclick="startTimer(${timer.id})">เล่นต่อ</button><button class="btn-clear" onclick="resetTimer(${timer.id})">เสร็จ</button></div>`; }
    else { buttonHTML = `<button class="btn-start btn-main" style="background-color: #2e7d32; color:white;" onclick="startTimer(${timer.id})">เริ่ม</button>`; }
    const cdBtn = (!timer.isRunning && !timer.isFinished && timer.elapsed === 0)
        ? `<button class="btn-cd-main" onclick="openCdModal(${timer.id})">⏱ เหมาเวลา</button>`
        : '';
    card.innerHTML = `<div style="color:#888; font-size:0.9rem;">${timer.name}</div><div class="timer-display" id="display-${timer.id}" style="${timer.isFinished ? 'color: #555;' : ''}">${formatTime(timer.elapsed)}</div><div>${buttonHTML}</div><div class="class-selector" style="${timer.isFinished ? 'pointer-events: none; opacity: 0.5;' : ''}">${['A', 'B', 'C'].map(c => `<div class="btn-class ${timer.activeClass === c ? 'active' : ''}" onclick="selectClass(${timer.id}, '${c}')">${c}</div>`).join('')}</div>${cdBtn}`;
}

function renderSummaryCard(card, timer) {
    if (timer.isFinished && timer.summary) {
        const inBasket = basket.includes(timer.id);
        let _sumHTML;
        if (timer.summary.isCountdown) {
            const s = timer.summary;
            const allPkgs = [s.package, ...(s.extraPackages || [])];
            _sumHTML = `<p>เล่น <span class="highlight">${s.totalDisplay}</span> นาที</p>`;
            allPkgs.forEach((p, i) => {
                const label = i === 0 ? 'เหมา' : '<span style="color:#90caf9;">+ เพิ่ม</span>';
                _sumHTML += `<p>${label} <span class="highlight">${fmtPkgDuration(p.package_seconds)}</span> &nbsp;·&nbsp; ราคา <span class="highlight">${Number(p.package_price).toLocaleString()}</span> บาท</p>`;
            });
            if (s.overtimeSecs > 0) _sumHTML += `<p>เล่นเกิน <span class="highlight" style="color:#ff9800;">${s.overtimeDisplay}</span> นาที &nbsp;·&nbsp; ราคา <span class="highlight" style="color:#ff9800;">${s.overtimeCost.toLocaleString()}</span> บาท</p>`;
            _sumHTML += `<p>ราคาที่ต้องชำระ <span class="highlight" id="total-display-${timer.id}" style="font-size:1.2rem;">${s.total.toLocaleString()}</span> บาท</p>`;
        } else {
            _sumHTML = `<p>ใช้เวลาทั้งหมด <span class="highlight">${timer.summary.minutes}</span> นาที</p><p>Class <span class="highlight">${timer.summary.class}</span></p><p>ค่าเปิดโต๊ะ: <span class="highlight">${timer.summary.base}</span> บาท</p><p>ราคาทั้งหมด <span class="highlight" id="total-display-${timer.id}" style="font-size:1.2rem;">${timer.summary.total.toLocaleString()}</span> บาท</p>`;
        }
        card.innerHTML = `
                    <div class="summary-header-box"><div class="summary-title">${timer.name}</div><button class="btn-basket-toggle ${inBasket ? 'in-basket' : ''}" onclick="toggleBasket(${timer.id})">${inBasket ? '✓ อยู่ในตะกร้า' : '🛒 เพิ่มในตะกร้า'}</button></div>
                    <div class="summary-content">
                        ${_sumHTML}
                    </div>
                    <div class="pay-type-container">
                        <button class="btn-pay-type ${timer.payType === 'cash' ? 'active-cash' : ''}" onclick="selectPayType(${timer.id}, 'cash')">เงินสด</button>
                        <button class="btn-pay-type ${timer.payType === 'transfer' ? 'active-transfer' : ''}" onclick="selectPayType(${timer.id}, 'transfer')">เงินโอน</button>
                    </div>
                    <div class="summary-footer">
                        <input type="tel" id="phone-input-${timer.id}" class="discount-field-full" placeholder="📱 เบอร์ลูกค้า" maxlength="10" autocomplete="off" style="margin-bottom:4px;" oninput="this.value=this.value.replace(/\\D/g,'');onPhoneInput(${timer.id},this.value)" onkeydown="if(event.key==='Enter')checkPoints(${timer.id})">
                        <div id="points-info-${timer.id}" style="font-size:0.8rem;color:#f1c40f;min-height:18px;margin-bottom:4px;padding-left:2px;"></div>
                        ${ENABLE_REDEEM ? `<input type="number" id="use-points-${timer.id}" class="discount-field-full" placeholder="ใช้แต้ม (ขั้นต่ำ ${MIN_REDEEM_POINTS} แต้ม)" min="${MIN_REDEEM_POINTS}" style="margin-bottom:4px;" oninput="calcPointsDiscount(${timer.id})" disabled>` : ''}
                        <input type="number" id="discount-input-${timer.id}" class="discount-field-full" placeholder="กรอกจำนวนเงินส่วนลด" value="${timer.summary.manualDiscount || ''}" oninput="updateTotalWithDiscount(${timer.id})">
                        <button class="btn-confirm-full" onclick="clearTableData(${timer.id})">ตกลง</button>
                    </div>`;
        // ── restore phone/points state after re-render ──────────────────
        const phoneEl   = document.getElementById(`phone-input-${timer.id}`)
        const useEl     = document.getElementById(`use-points-${timer.id}`)
        const infoEl    = document.getElementById(`points-info-${timer.id}`)
        if (phoneEl) phoneEl.value = timer._phone || ''
        if (infoEl && timer._pointsInfo) infoEl.innerHTML = timer._pointsInfo
        if (timer._phone && useEl && timer._balance != null) {
            useEl.disabled = false
            useEl.max = timer._balance
            if (timer._usePoints) {
                useEl.value = timer._usePoints
                calcPointsDiscount(timer.id)
            }
        }
    } else {
        card.innerHTML = `<div class="summary-header-box"><div class="summary-title" style="background:#333">${timer.name}</div></div><div class="summary-content"><p style="color:${timer.isRunning ? "#00e676" : "#555"}; font-size: 1.2rem;">${timer.isRunning ? "กำลังเล่น..." : "ว่าง"}</p></div><div class="summary-footer"><input type="text" class="discount-field-full" placeholder="กรอกจำนวนเงิน" disabled style="opacity: 0.3;"><button class="btn-confirm-full" style="background: #222; color: #444; cursor: default;">ตกลง</button></div>`;
    }
}

function formatTime(ms) {
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const d = Math.floor((ms % 1000) / 100);
    return `${h}:${m}:${s}.${d}`;
}

function selectPayType(id, type) {
    const timer = timers.find(t => t.id === id);
    timer.payType = (timer.payType === type) ? null : type;
    saveData();
    renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
}

function selectClass(id, className) { const timer = timers.find(t => t.id === id); timer.activeClass = (timer.activeClass === className) ? null : className; saveData(); renderTimerCard(document.getElementById(`card-${id}`), timer); }
function startTimer(id) {
    const timer = timers.find(t => t.id === id);
    if (timer.isRunning || timer.isFinished) return;
    if (!timer.activeClass && !timer.cdPackage) { alert("โปรดเลือก Class ก่อนเริ่ม"); return; }
    timer.isRunning = true; timer.isFinished = false;
    timer.startTime = Date.now() - timer.elapsed;
    timer.interval = setInterval(() => {
        timer.elapsed = Date.now() - timer.startTime;
        const el = document.getElementById(`display-${id}`);
        if (el) {
            if (timer.cdPackage) {
                el.textContent = formatCdDisplay(timer);
                el.style.color = getCdColor(timer);
            } else {
                el.textContent = formatTime(timer.elapsed);
            }
        }
        if (timer.cdPackage) {
            checkCdAlert(timer);
            checkCdTimesUp(timer);
            const cardEl = document.getElementById(`card-${timer.id}`);
            if (cardEl) {
                const isOt = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) * 1000 - timer.elapsed <= 0;
                cardEl.classList.toggle('cd-overtime-blink', isOt);
            }
        }
        saveData();
    }, 100);
    saveData();
    renderTimerCard(document.getElementById(`card-${id}`), timer);
    renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
}
function stopTimer(id) { const timer = timers.find(t => t.id === id); clearInterval(timer.interval); timer.isRunning = false; saveData(); renderTimerCard(document.getElementById(`card-${id}`), timer); renderSummaryCard(document.getElementById(`summary-card-${id}`), timer); }
function resetTimer(id) {
    const timer = timers.find(t => t.id === id);
    if (timer.isFinished) return;
    // ─── Countdown mode summary ────────────────────────────────────────────────
    if (timer.cdPackage) {
        const pkg = timer.cdPackage;
        const elapsedMs = timer.elapsed;
        const baseSeconds = timer.cdBaseSeconds || pkg.package_seconds;
        const packageMs = baseSeconds * 1000;
        const overtimeMs = Math.max(0, elapsedMs - packageMs);
        const overtimeSecs = Math.floor(overtimeMs / 1000);
        const overtimeMins = overtimeSecs >= CD_OVERTIME_FREE_SECONDS
            ? (CD_OVERTIME_CEIL ? Math.ceil(overtimeSecs / 60) : Math.floor(overtimeSecs / 60))
            : 0;
        const perMin = CLASS_CONFIG[pkg.package_class]?.perMin || 0;
        const overtimeCost = overtimeMins * perMin;
        const allPackages = [pkg, ...(timer.cdExtraPackages || [])];
        const totalPackagePrice = allPackages.reduce((sum, p) => sum + Number(p.package_price), 0);
        const total = totalPackagePrice + overtimeCost;
        const totalMins = Math.floor(elapsedMs / 60000);
        const totalSecs = Math.floor((elapsedMs % 60000) / 1000);
        const totalDisplay = `${totalMins}:${String(totalSecs).padStart(2,'0')}`;
        const overtimeDisplay = `${Math.floor(overtimeSecs / 60)}:${String(overtimeSecs % 60).padStart(2,'0')}`;
        timer.summary = {
            isCountdown: true, package: pkg, extraPackages: timer.cdExtraPackages || [],
            class: pkg.package_class,
            totalMs: elapsedMs, totalDisplay,
            packageMinutes: Math.floor(baseSeconds / 60),
            packagePrice: totalPackagePrice,
            overtimeMs, overtimeDisplay, overtimeSecs, overtimeMins, overtimeCost,
            total, originalTotal: total, elapsed: elapsedMs,
            minutes: Math.ceil(elapsedMs / 60000), base: totalPackagePrice, discount: 0,
        };
        timer.isFinished = true; timer.payType = null;
        clearInterval(timer.interval); timer.isRunning = false;
        saveData();
        renderTimerCard(document.getElementById(`card-${id}`), timer);
        renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
        return;
    }
    // ─── Normal timer summary ──────────────────────────────────────────────────
    if (timer.activeClass) {
        const config = CLASS_CONFIG[timer.activeClass];
        const minutes = Math.floor(timer.elapsed / 60000);
        const total = config.base + (minutes * config.perMin);
        timer.summary = { minutes, class: timer.activeClass, base: config.base, total, originalTotal: total, elapsed: timer.elapsed, discount: 0 };
        timer.isFinished = true; timer.payType = null;
    }
    clearInterval(timer.interval); timer.isRunning = false;
    saveData();
    renderTimerCard(document.getElementById(`card-${id}`), timer);
    renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
}
function updateTotalWithDiscount(id) {
    const timer = timers.find(t => t.id === id)
    if (!timer || !timer.summary) return
    const pointsDiscount = timer.summary.pointsDiscount || 0
    const manualDiscount = parseFloat(document.getElementById(`discount-input-${id}`)?.value) || 0
    timer.summary.manualDiscount = manualDiscount
    timer.summary.discount       = pointsDiscount + manualDiscount
    const newTotal = Math.max(0, timer.summary.originalTotal - timer.summary.discount)
    timer.summary.total = newTotal
    document.getElementById(`total-display-${id}`).textContent = newTotal.toLocaleString()
    if (basket.includes(id)) renderBasket()
}

async function clearTableData(id) {
    const timer = timers.find(t => t.id === id);
    if (timer.isFinished && !timer.payType) { alert("กรุณาเลือกประเภทการชำระเงิน (เงินสด หรือ เงินโอน) ก่อนกดตกลงครับ"); return; }

    // ─── redeem ก่อนชำระ (ถ้าลูกค้าเลือกใช้แต้ม) ─────────────────
    const _redeemPhone = document.getElementById(`phone-input-${id}`)?.value?.trim()
    const _pointsToUse = parseInt(document.getElementById(`use-points-${id}`)?.value) || 0
    if (_redeemPhone && _redeemPhone.length < 10) { alert('เบอร์ต้องมี 10 หลัก'); return }
    if (_redeemPhone && _pointsToUse > 0) {
        if (_pointsToUse < MIN_REDEEM_POINTS) {
            alert(`ใช้แต้มขั้นต่ำ ${MIN_REDEEM_POINTS} แต้มต่อครั้ง`)
            return
        }
        try {
            const res = await fetch(`${API_BASE}/customers/redeem`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: _redeemPhone, points_to_use: _pointsToUse, discount_amount: timer.summary.pointsDiscount || Math.floor(_pointsToUse * BAHT_PER_POINT) })
            })
            const data = await res.json()
            if (!data.success) { alert(data.message || 'ไม่สามารถใช้แต้มได้'); return; }
            showRedeemToast(data.data)
        } catch { alert('เชื่อมต่อ API ไม่ได้'); return; }
    }

    if (timer.summary) {
        reportData.totalClients++;
        reportData['count' + timer.summary.class]++;
        reportData.totalTimeMs += timer.summary.elapsed;
        reportData.grandTotal += timer.summary.total;
        const _incomeAmt = REPORT_INCOME_AFTER_DISCOUNT ? timer.summary.total : (timer.summary.originalTotal || timer.summary.total)
        reportData['income' + timer.summary.class] = (reportData['income' + timer.summary.class] || 0) + _incomeAmt;
        if (timer.payType === 'cash') { reportData.cashTotal = (reportData.cashTotal || 0) + timer.summary.total; }
        else if (timer.payType === 'transfer') { reportData.transferTotal = (reportData.transferTotal || 0) + timer.summary.total; }
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        transactionLogs.unshift({ id: Date.now(), time: timeStr, name: timer.name, class: timer.summary.class, duration: timer.summary.minutes, amount: timer.summary.total, elapsed: timer.summary.elapsed, payType: timer.payType });
        if (transactionLogs.length > 100) transactionLogs.pop();
    }
    const bIdx = basket.indexOf(id); if (bIdx !== -1) { basket.splice(bIdx, 1); renderBasket(); }
    const _earnPhone  = document.getElementById(`phone-input-${id}`)?.value?.trim()
    const _earnAmt    = timer.summary?.total
    const _didRedeem  = (parseInt(document.getElementById(`use-points-${id}`)?.value) || 0) > 0
    const _tableName  = timer.name
    const _payType    = timer.payType
    timer.isFinished = false; timer.summary = null; timer.elapsed = 0; timer.activeClass = null; timer.payType = null; timer._phone = null; timer._balance = null; timer._usePoints = 0; timer._pointsInfo = null; timer.cdPackage = null; timer.cdAlerted = false; timer.cdTimesUp = false; timer.cdBaseSeconds = 0; timer.cdExtraPackages = [];
    document.getElementById(`card-${id}`)?.classList.remove('cd-overtime-blink');
    saveData(); renderTimerCard(document.getElementById(`card-${id}`), timer); renderSummaryCard(document.getElementById(`summary-card-${id}`), timer); updateReportUI(); renderLogs();
    showPaymentToast(_tableName, _earnAmt, _payType)
    if (_earnPhone && _earnAmt && (EARN_ON_REDEEM || !_didRedeem)) earnPoints(_earnPhone, _earnAmt)
}

function deleteLogEntry(logId) {
    if (!confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    const index = transactionLogs.findIndex(log => log.id === logId);
    if (index !== -1) {
        const log = transactionLogs[index];
        if (log.isBasket && log.items) {
            log.items.forEach(item => {
                reportData.totalClients = Math.max(0, reportData.totalClients - 1);
                reportData['count' + item.class] = Math.max(0, reportData['count' + item.class] - 1);
                reportData.totalTimeMs = Math.max(0, reportData.totalTimeMs - item.elapsed);
                reportData.grandTotal = Math.max(0, reportData.grandTotal - item.amount);
                reportData['income' + item.class] = Math.max(0, (reportData['income' + item.class] || 0) - (item.originalAmount || item.amount));
            });
            if (log.payType === 'cash') reportData.cashTotal = Math.max(0, (reportData.cashTotal || 0) - log.amount);
            else if (log.payType === 'transfer') reportData.transferTotal = Math.max(0, (reportData.transferTotal || 0) - log.amount);
        } else {
            reportData.totalClients = Math.max(0, reportData.totalClients - 1);
            reportData['count' + log.class] = Math.max(0, reportData['count' + log.class] - 1);
            reportData.totalTimeMs = Math.max(0, reportData.totalTimeMs - log.elapsed);
            reportData.grandTotal = Math.max(0, reportData.grandTotal - log.amount);
            reportData['income' + log.class] = Math.max(0, (reportData['income' + log.class] || 0) - log.amount);
            if (log.payType === 'cash') { reportData.cashTotal = Math.max(0, (reportData.cashTotal || 0) - log.amount); }
            else if (log.payType === 'transfer') { reportData.transferTotal = Math.max(0, (reportData.transferTotal || 0) - log.amount); }
        }
        transactionLogs.splice(index, 1); saveData(); updateReportUI(); renderLogs();
    }
}

function updateReportUI() {
    document.getElementById('totalClients').textContent = reportData.totalClients;
    document.getElementById('countA').textContent = reportData.countA;
    document.getElementById('countB').textContent = reportData.countB;
    document.getElementById('countC').textContent = reportData.countC;
    document.getElementById('incomeA').textContent = (reportData.incomeA || 0).toLocaleString();
    document.getElementById('incomeB').textContent = (reportData.incomeB || 0).toLocaleString();
    document.getElementById('incomeC').textContent = (reportData.incomeC || 0).toLocaleString();
    document.getElementById('grandTotal').textContent = reportData.grandTotal.toLocaleString();
    document.getElementById('cashTotal').textContent = (reportData.cashTotal || 0).toLocaleString();
    document.getElementById('transferTotal').textContent = (reportData.transferTotal || 0).toLocaleString();
    const totalMinsAll = Math.floor(reportData.totalTimeMs / 60000);
    document.getElementById('totalHours').textContent = Math.floor(totalMinsAll / 60);
    document.getElementById('totalMinutes').textContent = totalMinsAll % 60;
}

function clearAllLogs() { if (confirm("ลบประวัติการรับเงินทั้งหมดใช่หรือไม่?")) { transactionLogs = []; saveData(); renderLogs(); } }

function resetFullReport() {
    openExpenseModal();
}

function openExpenseModal() {
    document.getElementById('modalIncome').textContent = reportData.grandTotal.toLocaleString();
    renderExpenseList();
    updateModalSummary();
    document.getElementById('expenseModal').style.display = 'flex';
    setTimeout(() => document.getElementById('expenseName').focus(), 100);
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function addExpense() {
    const nameEl = document.getElementById('expenseName');
    const amountEl = document.getElementById('expenseAmount');
    const name = nameEl.value.trim();
    const amount = parseFloat(amountEl.value);
    if (!name) { alert('กรุณากรอกชื่อรายการ'); nameEl.focus(); return; }
    if (!amount || amount <= 0) { alert('กรุณากรอกจำนวนเงินที่ถูกต้อง'); amountEl.focus(); return; }
    dailyExpenses.push({ name, amount });
    nameEl.value = ''; amountEl.value = '';
    nameEl.focus();
    renderExpenseList(); updateModalSummary();
}

function deleteExpense(index) {
    dailyExpenses.splice(index, 1);
    renderExpenseList(); updateModalSummary();
}

function editExpense(index) {
    const item = dailyExpenses[index];
    document.getElementById('expenseName').value = item.name;
    document.getElementById('expenseAmount').value = item.amount;
    dailyExpenses.splice(index, 1);
    renderExpenseList(); updateModalSummary();
    document.getElementById('expenseName').focus();
}

function renderExpenseList() {
    const list = document.getElementById('expenseList');
    if (!dailyExpenses.length) {
        list.innerHTML = '<div style="color:#555; text-align:center; padding:10px; font-style:italic;">ยังไม่มีรายการรายจ่าย</div>';
        return;
    }
    list.innerHTML = dailyExpenses.map((item, i) => `
                <div class="expense-item">
                    <span class="expense-item-name">${i + 1}. ${item.name}</span>
                    <span class="expense-item-amount">${item.amount.toLocaleString()} บาท</span>
                    <button style="background:#f57c00;color:white;padding:4px 8px;font-size:0.75rem;min-height:auto;" onclick="editExpense(${i})">แก้ไข</button>
                    <button style="background:#c62828;color:white;padding:4px 8px;font-size:0.75rem;min-height:auto;margin-left:4px;" onclick="deleteExpense(${i})">ลบ</button>
                </div>
            `).join('');
}

function updateModalSummary() {
    const totalExp = dailyExpenses.reduce((s, e) => s + e.amount, 0);
    const net = reportData.grandTotal - totalExp;
    document.getElementById('totalExpenseDisplay').textContent = totalExp.toLocaleString();
    const netEl = document.getElementById('netProfitDisplay');
    netEl.textContent = net.toLocaleString();
    netEl.style.color = net >= 0 ? '#00e676' : '#ff5252';
}

function confirmDailyClose() {
    if (!confirm('ยืนยันปิดยอดรายวันและบันทึกเข้ารายงานรายเดือนใช่หรือไม่?')) return;
    const totalExpenses = dailyExpenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = reportData.grandTotal - totalExpenses;
    if (reportData.grandTotal > 0 || dailyExpenses.length > 0) {
        const today = new Date();
        const dateStr = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const existingIndex = monthlyHistory.findIndex(item => item.date === dateStr);
        if (existingIndex !== -1) {
            const ex = monthlyHistory[existingIndex];
            const mergedExpenses = [...(ex.expenses || []), ...dailyExpenses];
            const mergedTotalExpenses = (ex.totalExpenses || 0) + totalExpenses;
            const mergedGrand = ex.grandTotal + reportData.grandTotal;
            monthlyHistory[existingIndex] = {
                ...ex,
                totalClients: ex.totalClients + reportData.totalClients,
                countA: ex.countA + reportData.countA, countB: ex.countB + reportData.countB, countC: ex.countC + reportData.countC,
                incomeA: ex.incomeA + reportData.incomeA, incomeB: ex.incomeB + reportData.incomeB, incomeC: ex.incomeC + reportData.incomeC,
                cashTotal: ex.cashTotal + reportData.cashTotal, transferTotal: ex.transferTotal + reportData.transferTotal,
                grandTotal: mergedGrand,
                expenses: mergedExpenses,
                totalExpenses: mergedTotalExpenses,
                netProfit: mergedGrand - mergedTotalExpenses,
                timestamp: Date.now()
            };
        } else {
            monthlyHistory.push({
                date: dateStr, timestamp: Date.now(),
                totalClients: reportData.totalClients,
                countA: reportData.countA, countB: reportData.countB, countC: reportData.countC,
                incomeA: reportData.incomeA, incomeB: reportData.incomeB, incomeC: reportData.incomeC,
                cashTotal: reportData.cashTotal, transferTotal: reportData.transferTotal,
                grandTotal: reportData.grandTotal,
                expenses: [...dailyExpenses],
                totalExpenses,
                netProfit
            });
        }
    }
    reportData = { totalClients: 0, countA: 0, countB: 0, countC: 0, incomeA: 0, incomeB: 0, incomeC: 0, totalTimeMs: 0, grandTotal: 0, cashTotal: 0, transferTotal: 0 };
    dailyExpenses = [];
    saveData(); updateReportUI();
    closeExpenseModal();
    alert('บันทึกรายจ่าย และรีเซ็ตยอดขายประจำวันสำเร็จครับ!');
}

function controlAll(action) {
    timers.forEach(t => {
        if (action === 'start' && !t.isRunning && !t.isFinished && t.activeClass) startTimer(t.id);
        if (action === 'stop' && t.isRunning) stopTimer(t.id);
        if (action === 'reset' && !t.isFinished) resetTimer(t.id);
    });
}
function updateName(id, val) { const timer = timers.find(t => t.id === id); timer.name = val || `โต๊ะที่ ${id}`; saveData(); renderTimerCard(document.getElementById(`card-${id}`), timer); renderSummaryCard(document.getElementById(`summary-card-${id}`), timer); }
countInput.addEventListener('change', () => { createTimers(); saveData(); });

// เพิ่มฟังก์ชันสำหรับรองรับการล้างข้อมูลจากหน้าต่างรายงานโดยตรง (แก้ปัญหา iPad)
window.clearMonthlyHistory = function () {
    monthlyHistory = [];
    localStorage.setItem('fn_monthly_history', JSON.stringify(monthlyHistory));
    alert("ล้างข้อมูลรายงานบัญชีรายเดือนเรียบร้อยแล้วครับ");
    // ส่งสัญญาณแจ้งเตือนไปยังแท็บรายงานอื่นๆ
    localStorage.setItem('fn_refresh_signal', Date.now());
};

function openMonthlyReportPage() {
    const reportWindow = window.open("", "_blank");
    const historyData = JSON.parse(localStorage.getItem('fn_monthly_history')) || [];
    historyData.sort((a, b) => b.timestamp - a.timestamp);

    let rowsHTML = historyData.map(item => {
        const expHtml = (item.expenses && item.expenses.length > 0)
            ? item.expenses.map(e => e.name + ': ' + e.amount.toLocaleString() + ' บาท').join('<br>') + '<br><strong style="color:#c62828;">(รวม ' + (item.totalExpenses || 0).toLocaleString() + ' บาท)</strong>'
            : '<span style="color:#999;">-</span>';
        const netP = item.netProfit !== undefined ? item.netProfit : item.grandTotal;
        return `
                <tr>
                    <td>${item.date}</td>
                    <td class="num">${item.totalClients}</td>
                    <td class="num font-green">${item.grandTotal.toLocaleString()}</td>
                    <td class="num">${item.countA}</td>
                    <td class="num">${item.incomeA.toLocaleString()}</td>
                    <td class="num">${item.countB}</td>
                    <td class="num">${item.incomeB.toLocaleString()}</td>
                    <td class="num">${item.countC}</td>
                    <td class="num">${item.incomeC.toLocaleString()}</td>
                    <td class="num font-blue">${item.cashTotal.toLocaleString()}</td>
                    <td class="num font-orange">${item.transferTotal.toLocaleString()}</td>
                    <td style="font-size:0.8rem; text-align:left; line-height:1.7; min-width:160px;">${expHtml}</td>
                    <td class="num" style="color:${netP >= 0 ? '#2e7d32' : '#c62828'}; font-weight:bold;">${netP.toLocaleString()}</td>
                </tr>`;
    }).join('');

    if (historyData.length === 0) { rowsHTML = `<tr><td colspan="13" class="empty">ยังไม่มีข้อมูลรายวันถูกบันทึกไว้ (ข้อมูลจะบันทึกเมื่อกดปุ่ม "รีเซ็ตยอดขายวันนี้")</td></tr>`; }

    const sumGrand = historyData.reduce((sum, item) => sum + item.grandTotal, 0);
    const sumClients = historyData.reduce((sum, item) => sum + item.totalClients, 0);
    const sumcA = historyData.reduce((sum, item) => sum + item.countA, 0);
    const sumiaA = historyData.reduce((sum, item) => sum + item.incomeA, 0);
    const sumcB = historyData.reduce((sum, item) => sum + item.countB, 0);
    const sumiaB = historyData.reduce((sum, item) => sum + item.incomeB, 0);
    const sumcC = historyData.reduce((sum, item) => sum + item.countC, 0);
    const sumiaC = historyData.reduce((sum, item) => sum + item.incomeC, 0);
    const sumCash = historyData.reduce((sum, item) => sum + item.cashTotal, 0);
    const sumTransfer = historyData.reduce((sum, item) => sum + item.transferTotal, 0);
    const sumExpenses = historyData.reduce((sum, item) => sum + (item.totalExpenses || 0), 0);
    const sumNetProfit = historyData.reduce((sum, item) => sum + (item.netProfit !== undefined ? item.netProfit : item.grandTotal), 0);

    reportWindow.document.write(`
                <!DOCTYPE html>
                <html lang="th">
                <head>
                    <meta charset="UTF-8">
                    <title>รายงานสรุปยอดบัญชีรายวัน/รายเดือน - FN MODEL EXCAVATOR</title>
                    <style>
                        body { font-family: 'Sarabun', 'Segoe UI', sans-serif; background-color: #ffffff; color: #333333; margin: 30px; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .btn-container { display: flex; justify-content: space-between; margin-bottom: 20px; }
                        button { padding: 10px 20px; font-weight: bold; cursor: pointer; border: none; border-radius: 4px; }
                        .btn-print { background-color: #2e7d32; color: white; }
                        .btn-clear { background-color: #c62828; color: white; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
                        th { background-color: #f5f5f5; color: #333; padding: 12px 8px; border: 1px solid #dddddd; font-weight: bold; text-align: center; }
                        td { padding: 10px 8px; border: 1px solid #dddddd; text-align: center; }
                        tr:nth-child(even) { background-color: #f9f9f9; }
                        .num { text-align: right; font-weight: bold; }
                        .font-green { color: #2e7d32; }
                        .font-blue { color: #0288d1; }
                        .font-orange { color: #e65100; }
                        .total-row { background-color: #eaeff5 !important; font-weight: bold; }
                        .empty { padding: 30px; color: #999; font-style: italic; }
                        @media print { .btn-container { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>📊 รายงานสรุปยอดบัญชีคาเฟ่รถตัก FN MODEL EXCAVATOR</h2>
                        <p>ข้อมูลบันทึกรายวันเพื่อประกอบการทำบัญชีร้าน</p>
                    </div>
                    <div class="btn-container">
                        <button class="btn-print" onclick="window.print()">🖨️ พิมพ์รายงาน / บันทึกเป็น PDF</button>
                        <button class="btn-clear" onclick="handleClearData()">🗑️ ล้างข้อมูลบัญชีทั้งหมด</button>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">วันที่</th>
                                <th rowspan="2">จำนวนลูกค้า<br>(โต๊ะ)</th>
                                <th rowspan="2">รายได้ทั้งหมด<br>(บาท)</th>
                                <th colspan="2">Class A</th>
                                <th colspan="2">Class B</th>
                                <th colspan="2">Class C</th>
                                <th rowspan="2">เงินสด<br>(บาท)</th>
                                <th rowspan="2">เงินโอน<br>(บาท)</th>
                                <th rowspan="2">รายจ่าย<br>(รายการ / รวมบาท)</th>
                                <th rowspan="2">กำไรสุทธิ<br>(บาท)</th>
                            </tr>
                            <tr>
                                <th>จำนวนโต๊ะ</th>
                                <th>รายได้</th>
                                <th>จำนวนโต๊ะ</th>
                                <th>รายได้</th>
                                <th>จำนวนโต๊ะ</th>
                                <th>รายได้</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                            <tr class="total-row">
                                <td>ยอดรวมสุทธิ</td>
                                <td class="num">${sumClients}</td>
                                <td class="num font-green">${sumGrand.toLocaleString()}</td>
                                <td class="num">${sumcA}</td>
                                <td class="num">${sumiaA.toLocaleString()}</td>
                                <td class="num">${sumcB}</td>
                                <td class="num">${sumiaB.toLocaleString()}</td>
                                <td class="num">${sumcC}</td>
                                <td class="num">${sumiaC.toLocaleString()}</td>
                                <td class="num font-blue">${sumCash.toLocaleString()}</td>
                                <td class="num font-orange">${sumTransfer.toLocaleString()}</td>
                                <td class="num" style="color:#c62828; font-weight:bold;">${sumExpenses.toLocaleString()}</td>
                                <td class="num" style="color:${sumNetProfit >= 0 ? '#2e7d32' : '#c62828'}; font-weight:bold;">${sumNetProfit.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                    <script>
                        function handleClearData() {
                            if(confirm('⚠ คำเตือน: คุณต้องการล้างข้อมูลรายงานสรุปบัญชีรายเดือนทั้งหมดใช่หรือไม่? (ข้อมูลจะหายถาวร)')) {
                                // วิธีแก้ปัญหา iPad: สั่งล้างข้อมูลโดยตรงในระบบเก็บข้อมูลร่วมกัน (localStorage)
                                localStorage.setItem('fn_monthly_history', JSON.stringify([]));
                                alert('ล้างข้อมูลรายงานบัญชีรายเดือนเรียบร้อยแล้วครับ');
                                // สั่งรีเฟรชหน้าหลักเพื่อให้จำข้อมูลใหม่
                                if(window.opener) {
                                    try { window.opener.location.reload(); } catch(e){}
                                }
                                window.close();
                            }
                        }
                    <\/script>
                </body>
                </html>
            `);
    reportWindow.document.close();
}

// คอยดักฟังเผื่อว่าหน้าต่างรายงานมีการสั่งล้างข้อมูล ระบบหน้าแรกจะได้รีเฟรชยอดให้ตรงกัน
window.addEventListener('storage', (e) => {
    if (e.key === 'fn_refresh_signal' || e.key === 'fn_monthly_history') {
        monthlyHistory = JSON.parse(localStorage.getItem('fn_monthly_history')) || [];
    }
});

function exportBackup() {
    const keys = ['fn_timers', 'fn_report', 'fn_logs', 'fn_monthly_history', 'fn_count'];
    const backup = {
        _meta: { app: 'FN MODEL EXCAVATOR', exportedAt: new Date().toISOString() }
    };
    keys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) backup[key] = JSON.parse(val);
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'fn-backup-' + dateStr + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup._meta || backup._meta.app !== 'FN MODEL EXCAVATOR') {
                alert('ไฟล์ไม่ถูกต้องครับ กรุณาเลือกไฟล์ backup ของระบบ FN MODEL EXCAVATOR เท่านั้น');
                return;
            }
            const exportedAt = new Date(backup._meta.exportedAt).toLocaleString('th-TH');
            if (!confirm('ยืนยันการกู้คืนข้อมูลจากไฟล์ที่ Export เมื่อ ' + exportedAt + '?\n\n⚠ ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยข้อมูลในไฟล์นี้')) return;
            const keys = ['fn_timers', 'fn_report', 'fn_logs', 'fn_monthly_history', 'fn_count'];
            keys.forEach(key => {
                if (backup[key] !== undefined) localStorage.setItem(key, JSON.stringify(backup[key]));
            });
            alert('กู้คืนข้อมูลสำเร็จแล้วครับ! ระบบจะรีโหลดหน้าจอ');
            location.reload();
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .json ที่ถูกต้อง');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function toggleBasket(id) {
    const timer = timers.find(t => t.id === id);
    if (!timer || !timer.isFinished) return;
    const idx = basket.indexOf(id);
    if (idx === -1) basket.push(id);
    else basket.splice(idx, 1);
    renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
    renderBasket();
}

function resetBasketPanel() {
    basketPayType = null;
    document.getElementById('basketCashBtn').className    = 'btn-pay-type';
    document.getElementById('basketTransferBtn').className = 'btn-pay-type';
    document.getElementById('basketPhone').value           = '';
    document.getElementById('basketPointsInfo').innerHTML  = '';
    const usePoints = document.getElementById('basketUsePoints');
    usePoints.value = ''; usePoints.max = ''; usePoints.disabled = true;
    const pdEl = document.getElementById('bkPtsDisc');
    const mdEl = document.getElementById('bkManDisc');
    const ftEl = document.getElementById('bkFinal');
    if (pdEl) pdEl.textContent = '—';
    if (mdEl) mdEl.textContent = '—';
    if (ftEl) ftEl.textContent = '0';
}

function clearBasket() {
    const prev = [...basket];
    basket = [];
    resetBasketPanel();
    prev.forEach(id => { const t = timers.find(t => t.id === id); if (t) renderSummaryCard(document.getElementById(`summary-card-${id}`), t); });
    renderBasket();
}

function selectBasketPayType(type) {
    basketPayType = (basketPayType === type) ? null : type;
    document.getElementById('basketCashBtn').className = 'btn-pay-type' + (basketPayType === 'cash' ? ' active-cash' : '');
    document.getElementById('basketTransferBtn').className = 'btn-pay-type' + (basketPayType === 'transfer' ? ' active-transfer' : '');
}

function updateBasketTotals() {
    const items = basket.map(id => timers.find(t => t.id === id)).filter(t => t && t.summary)
    const subtotal = items.reduce((s, t) => s + t.summary.total, 0)
    const manualDiscount = items.reduce((s, t) => s + (t.summary.manualDiscount || 0), 0)
    const pointsInput = document.getElementById('basketUsePoints')
    const points  = parseInt(pointsInput?.value) || 0
    const balance = parseInt(pointsInput?.max)   || 0
    const pointsDiscount = (points >= MIN_REDEEM_POINTS && points <= balance) ? Math.floor(points * BAHT_PER_POINT) : 0
    const finalTotal = Math.max(0, subtotal - pointsDiscount)
    const pdEl = document.getElementById('bkPtsDisc')
    const mdEl = document.getElementById('bkManDisc')
    const ftEl = document.getElementById('bkFinal')
    if (pdEl) pdEl.textContent = pointsDiscount > 0 ? `-${pointsDiscount.toLocaleString()} บาท` : '—'
    if (mdEl) mdEl.textContent = manualDiscount  > 0 ? `-${manualDiscount.toLocaleString()} บาท`  : '—'
    if (ftEl) ftEl.textContent = finalTotal.toLocaleString()
}

function renderBasket() {
    const panel = document.getElementById('basketPanel');
    if (basket.length === 0) { panel.style.display = 'none'; document.body.style.paddingBottom = '0'; return; }
    panel.style.display = 'flex';
    document.body.style.paddingBottom = '320px';
    const items = basket.map(id => timers.find(t => t.id === id)).filter(t => t && t.summary);
    const originalSubtotal = items.reduce((s, t) => s + (t.summary.originalTotal || t.summary.total), 0);
    document.getElementById('basketCount').textContent = items.length;
    document.getElementById('basketSubtotal').textContent = originalSubtotal.toLocaleString();
    document.getElementById('basketItemsList').innerHTML = items.map(t =>
        `<div class="basket-item"><span class="basket-item-name">${t.name}</span><span class="basket-item-detail">Class ${t.summary.class} · ${t.summary.minutes} นาที</span><span class="basket-item-price">${t.summary.total.toLocaleString()} บาท</span><button class="basket-item-remove" onclick="toggleBasket(${t.id})">✕</button></div>`
    ).join('');
    updateBasketTotals();
}

async function confirmBasketPayment() {
    console.log('[BASKET] confirmBasketPayment called, basketPayType:', basketPayType)
    if (!basketPayType) { alert('กรุณาเลือกประเภทการชำระเงิน (เงินสด หรือ เงินโอน)'); return; }
    const items = basket.map(id => timers.find(t => t.id === id)).filter(t => t && t.summary);
    console.log('[BASKET] items:', items.length)
    if (!items.length) { console.log('[BASKET] no items, return'); return; }
    if (!confirm(`ยืนยันชำระเงิน ${items.length} โต๊ะ ประเภท: ${basketPayType === 'cash' ? 'เงินสด' : 'เงินโอน'}?`)) { console.log('[BASKET] user cancelled confirm'); return; }

    // ─── redeem ก่อนชำระ (ถ้าลูกค้าเลือกใช้แต้ม) ─────────────────
    let discount = 0
    const _bRedeemPhone = document.getElementById('basketPhone')?.value?.trim()
    const _bPointsToUse = parseInt(document.getElementById('basketUsePoints')?.value) || 0
    console.log('[BASKET] phone:', _bRedeemPhone, '| points:', _bPointsToUse, '| MIN:', MIN_REDEEM_POINTS)
    if (_bRedeemPhone && _bRedeemPhone.length < 10) { alert('เบอร์ต้องมี 10 หลัก'); return }
    if (_bRedeemPhone && _bPointsToUse > 0) {
        if (_bPointsToUse < MIN_REDEEM_POINTS) {
            alert(`ใช้แต้มขั้นต่ำ ${MIN_REDEEM_POINTS} แต้มต่อครั้ง`)
            return
        }
        const _bDiscount = Math.floor(_bPointsToUse * BAHT_PER_POINT)
        console.log('[BASKET] calling redeem API...')
        try {
            const res = await fetch(`${API_BASE}/customers/redeem`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: _bRedeemPhone, points_to_use: _bPointsToUse, discount_amount: _bDiscount })
            })
            const data = await res.json()
            console.log('[BASKET] redeem response:', data)
            if (!data.success) { alert(data.message || 'ไม่สามารถใช้แต้มได้'); return; }
            discount = data.data.discount_amount
            console.log('[BASKET] discount from API:', discount)
            showRedeemToast(data.data)
        } catch (err) { console.error('[BASKET] redeem error:', err); alert('เชื่อมต่อ API ไม่ได้'); return; }
    } else {
        console.log('[BASKET] skip redeem — phone empty:', !_bRedeemPhone, '| points=0:', _bPointsToUse === 0)
    }

    const subtotal = items.reduce((s, t) => s + t.summary.total, 0);
    console.log('[BASKET] subtotal:', subtotal, '| discount:', discount, '| final:', subtotal - discount)
    let remaining = discount;
    const logItems = [];
    items.forEach((timer, idx) => {
        const isLast = idx === items.length - 1;
        const d = isLast ? remaining : (subtotal > 0 ? Math.round(timer.summary.total / subtotal * discount) : 0);
        if (!isLast) remaining -= d;
        const tableTotal = Math.max(0, timer.summary.total - d);
        console.log(`[BASKET] ${timer.name}: summary.total=${timer.summary.total}, d=${d}, tableTotal=${tableTotal}`)
        reportData.totalClients++;
        reportData['count' + timer.summary.class]++;
        reportData.totalTimeMs += timer.summary.elapsed;
        reportData.grandTotal += tableTotal;
        const _bIncomeAmt = REPORT_INCOME_AFTER_DISCOUNT ? tableTotal : (timer.summary.originalTotal || timer.summary.total)
        reportData['income' + timer.summary.class] = (reportData['income' + timer.summary.class] || 0) + _bIncomeAmt;
        if (basketPayType === 'cash') reportData.cashTotal = (reportData.cashTotal || 0) + tableTotal;
        else reportData.transferTotal = (reportData.transferTotal || 0) + tableTotal;
        logItems.push({ name: timer.name, class: timer.summary.class, minutes: timer.summary.minutes, amount: tableTotal, originalAmount: timer.summary.total, elapsed: timer.summary.elapsed });
        timer.isFinished = false; timer.summary = null; timer.elapsed = 0; timer.activeClass = null; timer.payType = null; timer._phone = null; timer._balance = null; timer._usePoints = 0; timer._pointsInfo = null; timer.cdPackage = null; timer.cdAlerted = false; timer.cdTimesUp = false; timer.cdBaseSeconds = 0; timer.cdExtraPackages = [];
        document.getElementById(`card-${timer.id}`)?.classList.remove('cd-overtime-blink');
        renderTimerCard(document.getElementById(`card-${timer.id}`), timer);
        renderSummaryCard(document.getElementById(`summary-card-${timer.id}`), timer);
    });
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    transactionLogs.unshift({
        id: Date.now(), time: timeStr,
        name: `ตะกร้า (${logItems.length} โต๊ะ)`,
        class: 'รวม', duration: logItems.reduce((s, i) => s + i.minutes, 0),
        originalAmount: subtotal,
        discount: discount,
        amount: logItems.reduce((s, i) => s + i.amount, 0),
        elapsed: logItems.reduce((s, i) => s + i.elapsed, 0),
        payType: basketPayType, isBasket: true, items: logItems
    });
    if (transactionLogs.length > 100) transactionLogs.pop();
    const _bPhone      = document.getElementById('basketPhone')?.value?.trim()
    const _bAmt        = logItems.reduce((s, i) => s + i.amount, 0)
    const _bDidRedeem  = (parseInt(document.getElementById('basketUsePoints')?.value) || 0) > 0
    basket = [];
    resetBasketPanel();
    saveData(); updateReportUI(); renderLogs(); renderBasket();
    showPaymentToast('ตะกร้า', _bAmt, basketPayType)
    if (_bPhone && (EARN_ON_REDEEM || !_bDidRedeem)) earnPoints(_bPhone, _bAmt)
}

// ดึงแต้มลูกค้าสำหรับ summary card รายโต๊ะ
async function checkPoints(id) {
    const phone = document.getElementById(`phone-input-${id}`)?.value?.trim()
    const infoEl = document.getElementById(`points-info-${id}`)
    const useInput = document.getElementById(`use-points-${id}`)
    if (!phone || !infoEl) return
    if (phone.length < 10) { infoEl.innerHTML = '<span style="color:#ff5252;">⚠ เบอร์ต้องมี 10 หลัก</span>'; return }

    const timer = timers.find(t => t.id === id)
    const total = timer?.summary?.total || 0
    const willEarn = Math.floor(total * POINT_PER_BAHT)
    const rateStr = `${Math.round(1 / POINT_PER_BAHT)} บาท = 1 แต้ม`

    try {
        const res = await fetch(`${API_BASE}/customers/points?phone=${encodeURIComponent(phone)}`)
        const data = await res.json()
        if (data.success) {
            const bal = data.data.balance
            const html = `⭐ <b>${bal.toLocaleString()}</b> แต้ม &nbsp;·&nbsp; ครั้งนี้จะได้ <b style="color:#00e676">+${willEarn}</b> แต้ม <span style="color:#555">(${rateStr})</span>`
            infoEl.innerHTML = html
            if (useInput) { useInput.disabled = false; useInput.max = bal }
            if (timer) { timer._phone = phone; timer._balance = bal; timer._pointsInfo = html }
        } else {
            const html = `✨ ลูกค้าใหม่ &nbsp;·&nbsp; จะได้ <b style="color:#00e676">+${willEarn}</b> แต้ม <span style="color:#555">(${rateStr})</span>`
            infoEl.innerHTML = html
            if (useInput) { useInput.disabled = true; useInput.value = '' }
            if (timer) { timer._phone = phone; timer._balance = null; timer._pointsInfo = html }
        }
    } catch { infoEl.textContent = '' }
}

function onPhoneInput(id, value) {
    const timer = timers.find(t => t.id === id)
    if (value.length === 10) {
        if (timer) timer._phone = value
        checkPoints(id)
    } else {
        if (timer) { timer._phone = value || null; timer._balance = null }
        const useInput = document.getElementById(`use-points-${id}`)
        if (useInput) { useInput.value = ''; useInput.disabled = true }
        const infoEl = document.getElementById(`points-info-${id}`)
        if (infoEl) infoEl.innerHTML = ''
        if (timer?.summary) { timer.summary.pointsDiscount = 0; updateTotalWithDiscount(id) }
    }
}

function onBasketPhoneInput(value) {
    if (value.length === 10) { checkBasketPoints() }
    else { clearBasketPointsOnPhoneEmpty() }
}

// เมื่อกรอก "ใช้แต้ม" → auto-fill ช่องส่วนลด
function clearPointsOnPhoneEmpty(id) {
    if (document.getElementById(`phone-input-${id}`)?.value) return
    const useInput = document.getElementById(`use-points-${id}`)
    if (useInput) { useInput.value = ''; useInput.disabled = true }
    document.getElementById(`points-info-${id}`).innerHTML = ''
    const timer = timers.find(t => t.id === id)
    if (timer) { timer._phone = null; timer._balance = null; timer._usePoints = 0 }
    if (timer?.summary) { timer.summary.pointsDiscount = 0; updateTotalWithDiscount(id) }
}

function clearBasketPointsOnPhoneEmpty() {
    if (document.getElementById('basketPhone')?.value) return
    const useInput = document.getElementById('basketUsePoints')
    useInput.value = ''; useInput.disabled = true
    document.getElementById('basketPointsInfo').innerHTML = ''
}

function calcPointsDiscount(id) {
    const timer    = timers.find(t => t.id === id)
    if (!timer?.summary) return
    const useInput = document.getElementById(`use-points-${id}`)
    const infoEl   = document.getElementById(`points-info-${id}`)
    const points   = parseInt(useInput?.value) || 0
    const balance  = parseInt(useInput?.max)   || 0

    if (points > 0 && points < MIN_REDEEM_POINTS) {
        if (infoEl) infoEl.innerHTML = `<span style="color:#ff5252">⚠ ขั้นต่ำ ${MIN_REDEEM_POINTS} แต้มต่อครั้ง</span>`
        timer.summary.pointsDiscount = 0; timer._usePoints = 0
        updateTotalWithDiscount(id)
        return
    }

    if (points > balance) {
        if (infoEl) infoEl.innerHTML = `<span style="color:#ff5252">⚠ แต้มไม่พอ — มีแค่ ${balance.toLocaleString()} แต้ม</span>`
        timer.summary.pointsDiscount = 0; timer._usePoints = 0
        updateTotalWithDiscount(id)
        return
    }

    const discount = Math.floor(points * BAHT_PER_POINT)
    timer.summary.pointsDiscount = discount
    timer._usePoints = points
    if (infoEl && points > 0) infoEl.innerHTML = `⭐ <b>${balance.toLocaleString()}</b> แต้ม &nbsp;·&nbsp; ใช้ ${points} แต้ม = <b style="color:#00e676">ลด ${discount} บาท</b>`
    else if (infoEl) infoEl.innerHTML = ''
    updateTotalWithDiscount(id)
}

// ดึงแต้มลูกค้าสำหรับตะกร้า
async function checkBasketPoints() {
    const phone = document.getElementById('basketPhone')?.value?.trim()
    const infoEl = document.getElementById('basketPointsInfo')
    const useInput = document.getElementById('basketUsePoints')
    if (!phone || !infoEl) return
    if (phone.length < 10) { infoEl.innerHTML = '<span style="color:#ff5252;">⚠ เบอร์ต้องมี 10 หลัก</span>'; return }

    const items = basket.map(id => timers.find(t => t.id === id)).filter(t => t && t.summary)
    const subtotal = items.reduce((s, t) => s + t.summary.total, 0)
    const willEarn = Math.floor(subtotal * POINT_PER_BAHT)
    const rateStr = `${Math.round(1 / POINT_PER_BAHT)} บาท = 1 แต้ม`

    try {
        const res = await fetch(`${API_BASE}/customers/points?phone=${encodeURIComponent(phone)}`)
        const data = await res.json()
        if (data.success) {
            const bal = data.data.balance
            infoEl.innerHTML = `⭐ <b>${bal.toLocaleString()}</b> แต้ม &nbsp;·&nbsp; ครั้งนี้จะได้ <b style="color:#00e676">+${willEarn}</b> แต้ม <span style="color:#555">(${rateStr})</span>`
            if (ENABLE_REDEEM) { useInput.disabled = false; useInput.max = bal }
        } else {
            infoEl.innerHTML = `✨ ลูกค้าใหม่ &nbsp;·&nbsp; จะได้ <b style="color:#00e676">+${willEarn}</b> แต้ม <span style="color:#555">(${rateStr})</span>`
            useInput.disabled = true
            useInput.value = ''
        }
    } catch { infoEl.textContent = '' }
}

// แสดงส่วนลดที่จะได้จากแต้มในตะกร้า (ข้อมูลเท่านั้น ไม่ส่งผลกับยอด)
function calcBasketPointsDiscount() {
    const useInput = document.getElementById('basketUsePoints')
    const infoEl   = document.getElementById('basketPointsInfo')
    const points   = parseInt(useInput?.value) || 0
    const balance  = parseInt(useInput?.max)   || 0

    if (points > 0 && points < MIN_REDEEM_POINTS) {
        if (infoEl) infoEl.innerHTML = `<span style="color:#ff5252">⚠ ขั้นต่ำ ${MIN_REDEEM_POINTS} แต้มต่อครั้ง</span>`
        return
    }

    if (points > balance) {
        if (infoEl) infoEl.innerHTML = `<span style="color:#ff5252">⚠ แต้มไม่พอ — มีแค่ ${balance.toLocaleString()} แต้ม</span>`
        return
    }

    const discount = Math.floor(points * BAHT_PER_POINT)
    if (infoEl && points > 0) infoEl.innerHTML = `⭐ ใช้ ${points} แต้ม = <b style="color:#00e676">ลด ${discount} บาท</b>`
    updateBasketTotals()
}

async function earnPoints(phone, amountPaid) {
    try {
        const res = await fetch(`${API_BASE}/customers/earn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, amount_paid: amountPaid, points_to_earn: Math.floor(amountPaid * POINT_PER_BAHT) })
        })
        const data = await res.json()
        if (data.success) showPointsToast(data.data)
    } catch (err) {
        console.error('points API error:', err)
    }
}

function showRedeemToast({ points_used, discount_amount, balance }) {
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;background:#7a5c00;color:#f1c40f;padding:14px 22px;border-radius:10px;font-size:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.6);font-family:inherit;border:1px solid #f1c40f;'
    toast.textContent = `🎟️ ใช้ ${points_used} แต้ม  ·  ลด ${discount_amount} บาท  ·  คงเหลือ ${balance.toLocaleString()} แต้ม`
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
}

function showPointsToast({ pointsEarned, balance }) {
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;top:80px;right:24px;z-index:9999;background:#1b5e20;color:white;padding:14px 22px;border-radius:10px;font-size:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.6);font-family:inherit;'
    toast.textContent = `⭐ +${pointsEarned} แต้ม  (คงเหลือ: ${balance.toLocaleString()} แต้ม)`
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
}

function showPaymentToast(name, amount, payType) {
    const typeLabel = payType === 'transfer' ? 'เงินโอน' : 'เงินสด'
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;background:#1a237e;color:white;padding:14px 22px;border-radius:10px;font-size:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.6);font-family:inherit;'
    toast.textContent = `✅ ชำระเงินสำเร็จ — ${name}  ·  ${(amount || 0).toLocaleString()} บาท  ·  ${typeLabel}`
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER — เหมาเวลา
// ═══════════════════════════════════════════════════════════════════════════════

function formatCdDisplay(timer) {
    const rem = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) * 1000 - timer.elapsed;
    if (rem > 0) {
        const h = Math.floor(rem / 3600000);
        const m = Math.floor((rem % 3600000) / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
        const ot = Math.abs(rem);
        const h = Math.floor(ot / 3600000);
        const m = Math.floor((ot % 3600000) / 60000);
        const s = Math.floor((ot % 60000) / 1000);
        if (h > 0) return `+${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
}

function getCdColor(timer) {
    const rem = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) * 1000 - timer.elapsed;
    if (rem <= 0) return '#ff5252';
    if (rem <= timer.cdPackage.package_alert_seconds * 1000) return '#ff9800';
    return '#00e676';
}

function checkCdAlert(timer) {
    if (!timer.cdPackage || timer.cdAlerted) return;
    const rem = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) * 1000 - timer.elapsed;
    if (rem <= timer.cdPackage.package_alert_seconds * 1000 && rem > 0) {
        timer.cdAlerted = true;
        showCdAlertToast(timer);
    }
}

function checkCdTimesUp(timer) {
    if (!timer.cdPackage || timer.cdTimesUp) return;
    const rem = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) * 1000 - timer.elapsed;
    if (rem <= 0) {
        timer.cdTimesUp = true;
        showCdTimesUpToast(timer);
        renderTimerCard(document.getElementById(`card-${timer.id}`), timer);
    }
}

function showCdTimesUpToast(timer) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;background:#b71c1c;color:white;padding:16px 26px;border-radius:10px;font-size:1.1rem;font-weight:bold;box-shadow:0 4px 24px rgba(255,82,82,0.7);font-family:inherit;border:2px solid #ff5252;cursor:pointer;';
    toast.textContent = `🚨 ${timer.name} — หมดเวลาแล้ว!`;
    toast.onclick = () => toast.remove();
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 12000);
    speakThai(() => timer.cdPackage ? `${timer.name} หมดเวลาแล้ว` : null, 'timesup');
}

function playAlertBeep(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'warning') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.7);
        } else {
            [0, 0.28, 0.56].forEach(t => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, ctx.currentTime + t);
                gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
                osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.22);
            });
        }
    } catch(e) {}
}

function speakThai(textFn, type = 'alert') {
    if (type === 'alert' && !ENABLE_CD_SPEECH_ALERT) return;
    if (type === 'timesup' && !ENABLE_CD_SPEECH_TIMESUP) return;
    _cdAudioQueue.push(typeof textFn === 'function' ? textFn : () => textFn);
    if (!_cdAudioBusy) _cdPlayNext();
}

function _cdPlayNext() {
    if (!_cdAudioQueue.length) { _cdAudioBusy = false; return; }
    _cdAudioBusy = true;
    const text = _cdAudioQueue.shift()();
    if (!text) { _cdPlayNext(); return; }

    // ทาง 1: มี Thai voice และไม่ใช่ Safari → ใช้ Web Speech API
    if (_cdThaiVoice && !_isSafari) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.voice = _cdThaiVoice;
        utter.lang = 'th-TH';
        utter.onend = _cdPlayNext;
        utter.onerror = _cdPlayNext;
        speechSynthesis.speak(utter);
        return;
    }

    // ทาง 2: ใช้ backend proxy ผ่าน Audio element ที่ unlock แล้ว
    if (!_cdAudio) { _cdAudioBusy = false; return; }
    const url = `${API_BASE}/tts?text=${encodeURIComponent(text)}`;
    _cdAudio.pause();
    _cdAudio.src = url;
    _cdAudio.load();
    _cdAudio.addEventListener('ended', _cdPlayNext, { once: true });
    _cdAudio.addEventListener('error', _cdPlayNext, { once: true });
    _cdAudio.play().catch(() => _cdPlayNext());
}

function showCdAlertToast(timer) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;background:#bf360c;color:white;padding:14px 22px;border-radius:10px;font-size:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.7);font-family:inherit;border:2px solid #ff9800;';
    toast.textContent = `⏰ ${timer.name} — เหลือเวลาอีก ${fmtPkgDuration(timer.cdPackage.package_alert_seconds)}!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
    speakThai(() => {
        if (!timer.cdPackage) return null;
        const secs = CD_SPEECH_REALTIME
            ? Math.max(0, Math.round((timer.cdPackage.package_seconds * 1000 - timer.elapsed) / 1000))
            : timer.cdPackage.package_alert_seconds;
        if (secs === 0) return null;
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        const timeStr = m > 0 ? (s > 0 ? `${m} นาที ${s} วินาที` : `${m} นาที`) : `${s} วินาที`;
        return `${timer.name} เหลืออีก ${timeStr}`;
    });
}

function fmtBadgePkgTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (s > 0) return `${m}:${String(s).padStart(2,'0')}`;
    return `${m}`;
}

function fmtBadgePkgs(mainPkg, extraPkgs) {
    const all = [mainPkg, ...extraPkgs];
    if (all.length === 1) {
        return `${fmtPkgDuration(mainPkg.package_seconds)} · ${Number(mainPkg.package_price).toLocaleString()} บาท`;
    }
    const times = all.map(p => fmtBadgePkgTime(p.package_seconds)).join('+') + ' นาที';
    const prices = all.map(p => Number(p.package_price).toLocaleString()).join('+') + ' บาท';
    return `${times} · ${prices}`;
}

function fmtPkgDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let str = '';
    if (h > 0) str += `${h} ชม.`;
    if (m > 0) str += `${h > 0 ? ' ' : ''}${m} นาที`;
    if (s > 0) str += ` ${s} วินาที`;
    return str || `${seconds} วินาที`;
}

function updateCdSecondsHint(val) {
    const el = document.getElementById('cdSecondsHint');
    if (!el) return;
    const s = parseInt(val);
    if (!s || s < 1) { el.textContent = ''; return; }
    el.textContent = `= ${fmtPkgDuration(s)}`;
}

function updateCdAlertHint(val) {
    const el = document.getElementById('cdAlertHint');
    if (!el) return;
    const s = parseInt(val);
    if (!s || s < 1) { el.textContent = ''; return; }
    el.textContent = `= ${fmtPkgDuration(s)}`;
}

async function loadCdPackages() {
    try {
        const res = await fetch(`${API_BASE}/countdown/packages`);
        const data = await res.json();
        if (data.success) cdPackages = data.data;
    } catch(e) {}
}

function _renderCdPackageList() {
    const classColor = { A: '#2e7d32', B: '#1565c0', C: '#6a1b9a' };
    const currentTimer = _cdModalMode === 'extend' ? timers.find(t => t.id === _cdModalTimerId) : null;
    const filterClass = currentTimer?.cdPackage?.package_class || null;
    const list = filterClass ? cdPackages.filter(p => p.package_class === filterClass) : cdPackages;
    document.getElementById('cdPackageList').innerHTML = list.map((pkg, idx) => {
        const realIdx = cdPackages.indexOf(pkg);
        return `
        <div class="cd-pkg-item" onclick="selectCdPackage(${realIdx})">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <span style="background:${classColor[pkg.package_class]||'#555'};color:white;padding:2px 9px;border-radius:4px;font-size:0.8rem;margin-right:8px;">Class ${pkg.package_class}</span>
                    <strong style="color:#eee;">${fmtPkgDuration(pkg.package_seconds)}</strong>
                </div>
                <span style="color:#f1c40f;font-weight:bold;font-size:1.05rem;">${Number(pkg.package_price).toLocaleString()} บาท</span>
            </div>
            <div style="font-size:0.76rem;color:#666;margin-top:5px;">แจ้งเตือนก่อนหมดเวลา ${fmtPkgDuration(pkg.package_alert_seconds)}</div>
        </div>`;
    }).join('');
}

function openCdModal(timerId) {
    if (!cdPackages.length) { alert('ยังไม่มี package เหมาเวลาในระบบ\nกรุณาเพิ่ม package ในส่วนจัดการ package ก่อนครับ'); return; }
    _cdModalMode = 'start';
    _cdModalTimerId = timerId;
    document.getElementById('cdModalTitle').textContent = '⏱ เลือก Package เหมาเวลา';
    _renderCdPackageList();
    document.getElementById('cdModal').style.display = 'flex';
}

function openCdExtendModal(timerId) {
    if (!cdPackages.length) { alert('ยังไม่มี package เหมาเวลาในระบบ'); return; }
    _cdModalMode = 'extend';
    _cdModalTimerId = timerId;
    document.getElementById('cdModalTitle').textContent = '+ ซื้อเวลาเพิ่ม';
    _renderCdPackageList();
    document.getElementById('cdModal').style.display = 'flex';
}

function closeCdModal() {
    document.getElementById('cdModal').style.display = 'none';
    _cdModalTimerId = null;
}

function selectCdPackage(pkgIdx) {
    const pkg = cdPackages[pkgIdx];
    if (!pkg || _cdModalTimerId == null) return;
    const timerId = _cdModalTimerId;
    const mode = _cdModalMode;
    closeCdModal();
    if (mode === 'extend') extendCdTimer(timerId, pkg);
    else startCdTimer(timerId, pkg);
}

function extendCdTimer(id, pkg) {
    const timer = timers.find(t => t.id === id);
    if (!timer || !timer.cdPackage || timer.isFinished) return;
    if (!timer.cdExtraPackages) timer.cdExtraPackages = [];
    timer.cdBaseSeconds = (timer.cdBaseSeconds || timer.cdPackage.package_seconds) + pkg.package_seconds;
    timer.cdExtraPackages.push(pkg);
    timer.cdAlerted = false;
    timer.cdTimesUp = false;
    document.getElementById(`card-${id}`)?.classList.remove('cd-overtime-blink');
    if (!timer.isRunning) startTimer(id);
    saveData();
    renderTimerCard(document.getElementById(`card-${id}`), timer);
    renderSummaryCard(document.getElementById(`summary-card-${id}`), timer);
}

function startCdTimer(id, pkg) {
    const timer = timers.find(t => t.id === id);
    if (!timer || timer.isRunning || timer.isFinished) return;
    timer.cdPackage = pkg;
    timer.cdAlerted = false;
    timer.cdTimesUp = false;
    timer.cdBaseSeconds = pkg.package_seconds;
    timer.cdExtraPackages = [];
    timer.activeClass = pkg.package_class;
    startTimer(id);
}

// ─── Admin: จัดการ Package เหมาเวลา ─────────────────────────────────────────

async function loadCdPackagesAdmin() {
    const el = document.getElementById('cdAdminTable');
    if (!el) return;
    try {
        const res = await fetch(`${API_BASE}/countdown/packages/all`);
        const data = await res.json();
        if (!data.success) { el.innerHTML = '<span style="color:#ff5252;">โหลดไม่ได้</span>'; return; }
        const classColor = { A: '#2e7d32', B: '#1565c0', C: '#6a1b9a' };
        if (!data.data.length) { el.innerHTML = '<div style="color:#555;padding:10px;">ยังไม่มี package</div>'; return; }
        el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:#888;border-bottom:1px solid #333;">
                <th style="text-align:left;padding:6px 8px;">Class</th>
                <th style="text-align:center;padding:6px 8px;">ระยะเวลา</th>
                <th style="text-align:center;padding:6px 8px;">ราคา</th>
                <th style="text-align:center;padding:6px 8px;">แจ้งเตือน</th>
                <th style="text-align:center;padding:6px 8px;">สถานะ</th>
                <th style="text-align:center;padding:6px 8px;">จัดการ</th>
            </tr></thead>
            <tbody>${data.data.map(p => `
                <tr style="border-bottom:1px solid #222;opacity:${p.package_status==='active'?1:0.5};">
                    <td style="padding:7px 8px;"><span style="background:${classColor[p.package_class]||'#555'};color:white;padding:2px 9px;border-radius:4px;font-size:0.8rem;">Class ${p.package_class}</span></td>
                    <td style="padding:7px 8px;text-align:center;color:#eee;">${fmtPkgDuration(p.package_seconds)}</td>
                    <td style="padding:7px 8px;text-align:center;color:#f1c40f;font-weight:bold;">${Number(p.package_price).toLocaleString()} บาท</td>
                    <td style="padding:7px 8px;text-align:center;color:#aaa;">${p.package_alert_seconds} วิ</td>
                    <td style="padding:7px 8px;text-align:center;color:${p.package_status==='active'?'#00e676':'#555'};">${p.package_status==='active'?'เปิด':'ปิด'}</td>
                    <td style="padding:7px 8px;text-align:center;white-space:nowrap;">
                        <button onclick="openCdPkgModal(${JSON.stringify(p).replace(/"/g,'&quot;')})" style="background:#333;color:#f1c40f;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:0.8rem;margin-right:4px;">แก้ไข</button>
                        <button onclick="deleteCdPkg('${p.package_id}')" style="background:#333;color:#ff5252;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:0.8rem;">ลบ</button>
                    </td>
                </tr>`).join('')}
            </tbody></table>`;
    } catch { el.innerHTML = '<span style="color:#ff5252;">เชื่อมต่อไม่ได้</span>'; }
}

function openCdPkgModal(pkg) {
    const modal = document.getElementById('cdPkgModal');
    document.getElementById('cdPkgModalTitle').textContent = pkg ? 'แก้ไข Package' : 'เพิ่ม Package';
    document.getElementById('cdPkgId').value       = pkg?.package_id       || '';
    document.getElementById('cdPkgClass').value    = pkg?.package_class    || 'A';
    document.getElementById('cdPkgSeconds').value  = pkg?.package_seconds  || '';
    updateCdSecondsHint(pkg?.package_seconds || '');
    document.getElementById('cdPkgPrice').value    = pkg?.package_price    || '';
    document.getElementById('cdPkgAlert').value    = pkg?.package_alert_seconds ?? 120;
    updateCdAlertHint(pkg?.package_alert_seconds ?? 120);
    document.getElementById('cdPkgStatus').value   = pkg?.package_status   || 'active';
    modal.style.display = 'flex';
}

function closeCdPkgModal() {
    document.getElementById('cdPkgModal').style.display = 'none';
}

async function saveCdPackage() {
    const id      = document.getElementById('cdPkgId').value.trim();
    const seconds = parseInt(document.getElementById('cdPkgSeconds').value);
    const price   = parseFloat(document.getElementById('cdPkgPrice').value);
    if (!seconds || seconds < 60) { alert('กรุณากรอกระยะเวลา (วินาที) ขั้นต่ำ 60 วินาที'); return; }
    if (isNaN(price) || price < 0) { alert('กรุณากรอกราคา'); return; }
    const body = {
        package_class:         document.getElementById('cdPkgClass').value,
        package_seconds:       seconds,
        package_price:         price,
        package_alert_seconds: parseInt(document.getElementById('cdPkgAlert').value) || 120,
        package_status:        document.getElementById('cdPkgStatus').value,
    };
    try {
        const res  = await fetch(id ? `${API_BASE}/countdown/packages/${id}` : `${API_BASE}/countdown/packages`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) { alert(data.message || 'บันทึกไม่สำเร็จ'); return; }
        closeCdPkgModal();
        loadCdPackages();
        loadCdPackagesAdmin();
    } catch { alert('เชื่อมต่อ API ไม่ได้'); }
}

async function deleteCdPkg(id) {
    if (!confirm('ลบ package นี้?')) return;
    try {
        const res  = await fetch(`${API_BASE}/countdown/packages/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) { alert(data.message || 'ลบไม่สำเร็จ'); return; }
        loadCdPackages();
        loadCdPackagesAdmin();
    } catch { alert('เชื่อมต่อ API ไม่ได้'); }
}

async function lookupPoints() {
    const phone = document.getElementById('lookupPhone').value.trim()
    if (!phone) return
    const el = document.getElementById('lookupResult')
    if (phone.length < 10) { el.innerHTML = '<span style="color:#ff5252;padding:10px;display:block;">⚠ เบอร์ต้องมี 10 หลัก</span>'; return }
    el.innerHTML = '<span style="color:#888;padding:10px;display:block;">กำลังค้นหา...</span>'
    try {
        const [pointsRes, rewardsRes] = await Promise.all([
            fetch(`${API_BASE}/customers/points?phone=${encodeURIComponent(phone)}`),
            fetch(`${API_BASE}/rewards`)
        ])
        const pointsData  = await pointsRes.json()
        const rewardsData = await rewardsRes.json()

        if (!pointsData.success) { el.innerHTML = '<span style="color:#ff5252;padding:10px;display:block;">ไม่พบลูกค้า</span>'; return; }

        const { customer, balance, history } = pointsData.data
        const rewards = rewardsData.success ? rewardsData.data : []
        const name = [customer.customers_fname, customer.customers_lname].filter(Boolean).join(' ')

        const histHtml = history.slice(0, 5).map(h => {
            const sign = h.point_transactions_delta > 0 ? '+' : ''
            const color = h.point_transactions_delta > 0 ? '#00e676' : '#ff5252'
            const raw = h.point_transactions_created_at
            const dt  = raw ? new Date(raw.replace(' ', 'T')) : null
            const date = dt && !isNaN(dt) ? dt.toLocaleDateString('th-TH') : ''
            const time = dt && !isNaN(dt) ? dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''
            const note = h.point_transactions_note ? ` · ${h.point_transactions_note}` : ''
            return `<div style="font-size:0.8rem;color:${color};border-bottom:1px solid #2a2a2a;padding:4px 0;">${sign}${h.point_transactions_delta} แต้ม · ${h.point_transactions_type}${note} · ${date} ${time}</div>`
        }).join('')

        const typeLabel = { discount: 'ส่วนลด', item: 'ของรางวัล', privilege: 'สิทธิพิเศษ', free_time: 'เวลาฟรี' }
        const typeColor = { discount: '#0288d1', item: '#f57c00', privilege: '#9c27b0', free_time: '#00e676' }
        const rewardsHtml = rewards.length ? `
            <div style="color:#666;font-size:0.75rem;margin:12px 0 6px;">แลกของรางวัล</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${rewards.map(r => {
                    const canAfford  = balance >= r.rewards_points_cost
                    const outOfStock = r.rewards_stock !== null && r.rewards_stock <= 0
                    const disabled   = !canAfford || outOfStock
                    const opacity    = disabled ? '0.45' : '1'
                    const extraInfo  = r.rewards_type === 'free_time'
                        ? `<span style="color:#00e676;font-size:0.72rem;">+${Math.floor(r.rewards_free_seconds/60)} นาที</span>`
                        : r.rewards_type === 'discount' && r.rewards_discount_value
                        ? `<span style="color:#0288d1;font-size:0.72rem;">ลด ${r.rewards_discount_value} บาท</span>`
                        : ''
                    const stockText  = r.rewards_stock !== null
                        ? `<span style="color:#555;font-size:0.7rem;">เหลือ ${r.rewards_stock}</span>`
                        : ''
                    return `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:#252525;border-radius:6px;padding:8px 12px;opacity:${opacity};">
                        <div>
                            <span style="background:${typeColor[r.rewards_type]||'#555'};color:#fff;font-size:0.65rem;border-radius:4px;padding:1px 6px;margin-right:6px;">${typeLabel[r.rewards_type]||r.rewards_type}</span>
                            <span style="color:#eee;font-size:0.9rem;">${r.rewards_name}</span>
                            ${extraInfo ? `&nbsp;${extraInfo}` : ''}
                            ${stockText ? `&nbsp;${stockText}` : ''}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:#f1c40f;font-size:0.85rem;white-space:nowrap;">⭐ ${r.rewards_points_cost}</span>
                            <button onclick="redeemRewardForCustomer('${phone}','${r.rewards_id}','${r.rewards_name}',${r.rewards_points_cost})"
                                style="background:${disabled?'#333':'#f1c40f'};color:${disabled?'#555':'#121212'};border:none;border-radius:4px;padding:4px 12px;font-size:0.8rem;cursor:${disabled?'not-allowed':'pointer'};"
                                ${disabled ? 'disabled' : ''}>
                                ${outOfStock ? 'หมด' : canAfford ? 'แลก' : 'แต้มไม่พอ'}
                            </button>
                        </div>
                    </div>`
                }).join('')}
            </div>` : ''

        el.innerHTML = `
            <div style="background:#1e1e1e;border-radius:8px;padding:14px;margin-top:10px;">
                <div style="color:#00e676;font-weight:bold;font-size:1rem;">📱 ${customer.customers_phone}</div>
                ${name ? `<div style="color:#aaa;font-size:0.9rem;">${name}</div>` : ''}
                <div style="font-size:1.6rem;color:#f1c40f;font-weight:bold;margin:10px 0;">⭐ ${balance.toLocaleString()} แต้ม</div>
                ${history.length ? `<div style="color:#666;font-size:0.75rem;margin-bottom:6px;">ประวัติล่าสุด</div>${histHtml}` : ''}
                ${rewardsHtml}
            </div>`
    } catch {
        el.innerHTML = '<span style="color:#ff5252;padding:10px;display:block;">เชื่อมต่อ API ไม่ได้</span>'
    }
}

async function redeemRewardForCustomer(phone, rewardId, rewardName, pointsCost) {
    if (!confirm(`แลก "${rewardName}" ใช้ ${pointsCost} แต้ม?`)) return
    try {
        const res  = await fetch(`${API_BASE}/rewards/redeem`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, reward_id: rewardId })
        })
        const data = await res.json()
        if (!data.success) { alert(data.message || 'แลกไม่สำเร็จ'); return; }
        showRewardToast(data.data)
        lookupPoints()
    } catch { alert('เชื่อมต่อ API ไม่ได้') }
}

function showRewardToast({ reward_name, points_used, new_balance }) {
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;background:#1a3a1a;color:#00e676;padding:14px 22px;border-radius:10px;font-size:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.6);font-family:inherit;border:1px solid #00e676;'
    toast.textContent = `🎁 แลก "${reward_name}"  ·  ใช้ ${points_used} แต้ม  ·  คงเหลือ ${new_balance.toLocaleString()} แต้ม`
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
}

function renderPointsConfig() {
    const el = document.getElementById('pointsConfigDisplay')
    if (!el) return
    const chip = (label, value, color = '#f1c40f') =>
        `<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:6px 12px;font-size:0.78rem;color:#888;">
            ${label}: <span style="color:${color};font-weight:700;">${value}</span>
         </div>`
    el.innerHTML =
        chip('สะสม', `ทุก ${BAHT_FOR_1_POINT} บาท = 1 แต้ม`) +
        (ENABLE_REDEEM ? chip('แลก', `${POINTS_FOR_1_BAHT} แต้ม = 1 บาท`) : '') +
        (ENABLE_REDEEM ? chip('ขั้นต่ำแลก', `${MIN_REDEEM_POINTS} แต้ม`) : '') +
        (ENABLE_REDEEM ? chip('บวกแต้มเมื่อใช้แต้ม', EARN_ON_REDEEM ? 'ใช่' : 'ไม่', EARN_ON_REDEEM ? '#00e676' : '#ff5252') : '')
}

// ─── CRUD รางวัล ──────────────────────────────────────────────────────────────

async function loadRewardsAdmin() {
    const el = document.getElementById('rewardsAdminTable')
    if (!el) return
    try {
        const res  = await fetch(`${API_BASE}/rewards/all`)
        const data = await res.json()
        if (!data.success) { el.innerHTML = '<span style="color:#ff5252;">โหลดไม่ได้</span>'; return }
        const typeLabel = { discount:'ส่วนลด', item:'ของรางวัล', privilege:'สิทธิพิเศษ', free_time:'เวลาฟรี' }
        const typeColor = { discount:'#0288d1', item:'#f57c00', privilege:'#9c27b0', free_time:'#00e676' }
        if (!data.data.length) { el.innerHTML = '<div style="color:#555;padding:10px;">ยังไม่มีรางวัล</div>'; return }
        el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:#888;border-bottom:1px solid #333;">
                <th style="text-align:left;padding:6px 8px;">ชื่อ</th>
                <th style="text-align:left;padding:6px 8px;">ประเภท</th>
                <th style="text-align:center;padding:6px 8px;">แต้ม</th>
                <th style="text-align:center;padding:6px 8px;">Stock</th>
                <th style="text-align:center;padding:6px 8px;">สถานะ</th>
                <th style="text-align:center;padding:6px 8px;">จัดการ</th>
            </tr></thead>
            <tbody>${data.data.map(r => `
                <tr style="border-bottom:1px solid #222;opacity:${r.rewards_status==='active'?1:0.5};">
                    <td style="padding:7px 8px;color:#eee;">${r.rewards_name}${r.rewards_free_seconds ? `<span style="color:#00e676;font-size:0.75rem;margin-left:6px;">${Math.floor(r.rewards_free_seconds/60)} นาที</span>` : ''}${r.rewards_discount_value ? `<span style="color:#0288d1;font-size:0.75rem;margin-left:6px;">ลด ${r.rewards_discount_value} บาท</span>` : ''}</td>
                    <td style="padding:7px 8px;"><span style="background:${typeColor[r.rewards_type]||'#555'};color:#fff;font-size:0.7rem;border-radius:4px;padding:2px 7px;">${typeLabel[r.rewards_type]||r.rewards_type}</span></td>
                    <td style="padding:7px 8px;text-align:center;color:#f1c40f;">⭐ ${r.rewards_points_cost}</td>
                    <td style="padding:7px 8px;text-align:center;color:#aaa;">${r.rewards_stock ?? '∞'}</td>
                    <td style="padding:7px 8px;text-align:center;">
                        <span style="color:${r.rewards_status==='active'?'#00e676':'#555'};">${r.rewards_status==='active'?'เปิด':'ปิด'}</span>
                    </td>
                    <td style="padding:7px 8px;text-align:center;white-space:nowrap;">
                        <button onclick="openRewardModal(${JSON.stringify(r).replace(/"/g,'&quot;')})" style="background:#333;color:#f1c40f;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:0.8rem;margin-right:4px;">แก้ไข</button>
                        <button onclick="deleteRewardItem('${r.rewards_id}','${r.rewards_name}')" style="background:#333;color:#ff5252;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:0.8rem;">ยกเลิก</button>
                    </td>
                </tr>`).join('')}
            </tbody></table>`
    } catch { el.innerHTML = '<span style="color:#ff5252;">เชื่อมต่อไม่ได้</span>' }
}

function onRewardTypeChange() {
    const type = document.getElementById('rmType').value
    document.getElementById('rmFreeTimeRow').style.display  = type === 'free_time' ? '' : 'none'
    document.getElementById('rmDiscountRow').style.display  = type === 'discount'  ? '' : 'none'
}

function openRewardModal(reward) {
    const modal = document.getElementById('rewardModal')
    document.getElementById('rewardModalTitle').textContent = reward ? 'แก้ไขรางวัล' : 'เพิ่มรางวัล'
    document.getElementById('rmId').value            = reward?.rewards_id          || ''
    document.getElementById('rmName').value          = reward?.rewards_name        || ''
    document.getElementById('rmType').value          = reward?.rewards_type        || 'item'
    document.getElementById('rmPoints').value        = reward?.rewards_points_cost || ''
    document.getElementById('rmFreeSeconds').value   = reward?.rewards_free_seconds || ''
    document.getElementById('rmDiscountValue').value = reward?.rewards_discount_value || ''
    document.getElementById('rmStock').value         = reward?.rewards_stock ?? ''
    document.getElementById('rmStatus').value        = reward?.rewards_status || 'active'
    onRewardTypeChange()
    modal.style.display = 'flex'
}

function closeRewardModal() {
    document.getElementById('rewardModal').style.display = 'none'
}

async function saveReward() {
    const id     = document.getElementById('rmId').value.trim()
    const type   = document.getElementById('rmType').value
    const stock  = document.getElementById('rmStock').value.trim()
    const body   = {
        rewards_name:           document.getElementById('rmName').value.trim(),
        rewards_type:           type,
        rewards_points_cost:    document.getElementById('rmPoints').value || null,
        rewards_free_seconds:   type === 'free_time' ? (document.getElementById('rmFreeSeconds').value || null) : null,
        rewards_discount_value: type === 'discount'  ? (document.getElementById('rmDiscountValue').value || null) : null,
        rewards_stock:          stock !== '' ? stock : null,
        rewards_status:         document.getElementById('rmStatus').value,
    }
    if (!body.rewards_name)        { alert('กรุณากรอกชื่อรางวัล'); return }
    if (!body.rewards_points_cost) { alert('กรุณากรอกแต้มที่ใช้'); return }

    try {
        const res  = await fetch(id ? `${API_BASE}/rewards/${id}` : `${API_BASE}/rewards`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!data.success) { alert(data.message || 'บันทึกไม่สำเร็จ'); return }
        closeRewardModal()
        loadRewardsAdmin()
    } catch { alert('เชื่อมต่อ API ไม่ได้') }
}

async function deleteRewardItem(id, name) {
    if (!confirm(`ยกเลิก "${name}"?\n(ถ้ามีประวัติการแลกจะปิดใช้งานแทนการลบถาวร)`)) return
    try {
        const res  = await fetch(`${API_BASE}/rewards/${id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!data.success) { alert(data.message || 'ลบไม่สำเร็จ'); return }
        loadRewardsAdmin()
    } catch { alert('เชื่อมต่อ API ไม่ได้') }
}

window.onload = () => {
    createTimers(true)
    renderPointsConfig()
    if (ENABLE_REWARDS) {
        loadRewardsAdmin()
    } else {
        const sec = document.getElementById('rewardsAdminSection')
        if (sec) sec.style.display = 'none'
    }
    if (!ENABLE_REDEEM) {
        const el = document.getElementById('basketUsePoints')
        if (el) el.style.display = 'none'
    }
    loadCdPackages()
    if (ENABLE_CD_ADMIN) {
        loadCdPackagesAdmin()
    } else {
        const sec = document.querySelector('.report-section:has(#cdAdminTable)')
        if (sec) sec.style.display = 'none'
    }
}