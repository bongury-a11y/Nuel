// 기본 스크롤 복원 동작 막기 (화면 튐 버그 방지)
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }

        // ==========================================
        // 0. DualAudioPlayer 클래스 (Seamless Crossfade Loop)
        // ==========================================
        class DualAudioPlayer {
            constructor() {
                this.audioA = new Audio();
                this.audioB = new Audio();
                this.audioA.preload = "auto";
                this.audioB.preload = "auto";
                this.active = this.audioA;
                this.inactive = this.audioB;

                this.targetVolume = 1.0;
                this.isMuted = false;
                this.fadeDuration = 2.5; 
                this.src = "";
                this.isPlaying = false;
                this.isCrossfading = false;
                this.crossfadeInterval = null;
                this.externalFadeInterval = null;

                var self = this;
                var onTimeUpdate = function(e) {
                    var audio = e.target;
                    if (!self.isPlaying || self.isCrossfading) return;
                    
                    if (audio === self.active && audio.duration > 0) {
                        var currentFade = self.fadeDuration;
                        if(audio.duration < 5) currentFade = audio.duration * 0.2; 

                        if (audio.duration - audio.currentTime <= currentFade) {
                            self.doCrossfade(currentFade);
                        }
                    }
                };

                this.audioA.addEventListener('timeupdate', onTimeUpdate);
                this.audioB.addEventListener('timeupdate', onTimeUpdate);

                this.audioA.addEventListener('ended', function(){ self.fallbackSwap(self.audioB, self.audioA); });
                this.audioB.addEventListener('ended', function(){ self.fallbackSwap(self.audioA, self.audioB); });
            }

            fallbackSwap(nextAudio, prevAudio) {
                if(!this.isPlaying) return;
                prevAudio.pause();
                prevAudio.currentTime = 0;
                nextAudio.volume = this.isMuted ? 0 : this.targetVolume;
                nextAudio.play().catch(function(){});
                this.active = nextAudio;
                this.inactive = prevAudio;
                this.isCrossfading = false;
                clearInterval(this.crossfadeInterval);
            }

            setSrc(url) {
                this.src = url;
                this.stop();
                this.audioA.src = url;
                this.audioB.src = url;
                this.audioA.load();
                this.audioB.load();
            }

            // 명상 중 음원 변경시 부드러운 전환 (NEW v1.6.4)
            // 기존 active 트랙을 페이드아웃하면서 inactive에 새 src를 페이드인.
            crossfadeToSrc(url, fadeTime) {
                if (!fadeTime) fadeTime = 2.0;
                this.src = url;

                if (!this.isPlaying) {
                    // 재생 중이 아니면 그냥 src만 교체
                    this.setSrc(url);
                    return;
                }

                clearInterval(this.crossfadeInterval);
                this.crossfadeInterval = null;
                this.isCrossfading = true;

                var fadingOut = this.active;
                var fadingIn = this.inactive;

                fadingIn.src = url;
                fadingIn.load();
                fadingIn.currentTime = 0;
                fadingIn.volume = 0;
                fadingIn.play().catch(function(){});

                var steps = 25;
                var stepTime = (fadeTime * 1000) / steps;
                var startVol = fadingOut.volume;
                var endVol = this.isMuted ? 0 : this.targetVolume;
                var currentStep = 0;
                var self = this;

                this.crossfadeInterval = setInterval(function(){
                    currentStep++;
                    if (currentStep >= steps) {
                        clearInterval(self.crossfadeInterval);
                        self.crossfadeInterval = null; // ← null 초기화
                        fadingOut.pause();
                        fadingOut.currentTime = 0;
                        fadingOut.src = url;
                        fadingOut.load();
                        fadingIn.volume = endVol;
                        self.active = fadingIn;
                        self.inactive = fadingOut;
                        self.isCrossfading = false;
                    } else {
                        var ratio = currentStep / steps;
                        if(!self.isMuted) {
                            fadingOut.volume = Math.max(0, startVol * (1 - ratio));
                            fadingIn.volume = Math.min(endVol, endVol * ratio);
                        }
                    }
                }, stepTime);
            }

            // 외부에서 시작 페이드인 요청 (NEW v1.6.4) - 시작 종소리가 묻히지 않게
            playWithFadeIn(fadeTime) {
                if (!fadeTime) fadeTime = 1.5;
                this.isPlaying = true;
                this.active.volume = 0;
                this.active.play().catch(function(){});
                
                clearInterval(this.externalFadeInterval);
                this.externalFadeInterval = null;
                var self = this;
                var steps = 20;
                var stepTime = (fadeTime * 1000) / steps;
                var endVol = this.isMuted ? 0 : this.targetVolume;
                var currentStep = 0;
                this.externalFadeInterval = setInterval(function(){
                    currentStep++;
                    if (currentStep >= steps) {
                        clearInterval(self.externalFadeInterval);
                        self.externalFadeInterval = null; // ← 반드시 null로 초기화
                        if (!self.isCrossfading && !self.isMuted) self.active.volume = self.targetVolume;
                    } else {
                        if (!self.isCrossfading && !self.isMuted) {
                            self.active.volume = Math.min(endVol, (endVol * currentStep) / steps);
                        }
                    }
                }, stepTime);
            }

            // 외부에서 종료 페이드아웃 요청 (NEW v1.6.4)
            // 페이드아웃 중에도 stop() 충돌 안 나도록 안전하게 처리
            fadeOutAndStop(fadeTime, onDone) {
                if (!fadeTime) fadeTime = 3.0;
                if (!this.isPlaying) {
                    this.stop();
                    if (onDone) onDone();
                    return;
                }
                clearInterval(this.crossfadeInterval);
                this.crossfadeInterval = null;
                clearInterval(this.externalFadeInterval);
                this.externalFadeInterval = null;
                this.isCrossfading = true;

                var self = this;
                var startVolA = this.audioA.volume;
                var startVolB = this.audioB.volume;
                var steps = 30;
                var stepTime = (fadeTime * 1000) / steps;
                var currentStep = 0;
                this.externalFadeInterval = setInterval(function(){
                    currentStep++;
                    if (currentStep >= steps) {
                        clearInterval(self.externalFadeInterval);
                        self.externalFadeInterval = null; // ← null 초기화
                        self.stop();
                        if (onDone) onDone();
                    } else {
                        var ratio = 1 - (currentStep / steps);
                        if (!self.isMuted) {
                            self.audioA.volume = startVolA * ratio;
                            self.audioB.volume = startVolB * ratio;
                        }
                    }
                }, stepTime);
            }

            play() {
                this.isPlaying = true;
                this.active.volume = this.isMuted ? 0 : this.targetVolume;
                this.active.play().catch(function(){});
            }

            pause() {
                this.isPlaying = false;
                this.audioA.pause();
                this.audioB.pause();
                clearInterval(this.crossfadeInterval);
                this.crossfadeInterval = null;
                clearInterval(this.externalFadeInterval);
                this.externalFadeInterval = null;
                this.isCrossfading = false;
            }

            stop() {
                this.pause();
                this.audioA.currentTime = 0;
                this.audioB.currentTime = 0;
                this.active = this.audioA;
                this.inactive = this.audioB;
            }

            setVolume(vol) {
                this.targetVolume = vol;
                if (!this.isCrossfading && !this.externalFadeInterval) {
                    if (!this.isMuted) this.active.volume = this.targetVolume;
                }
            }

            setMuted(muted) {
                this.isMuted = muted;
                if (muted) {
                    this.audioA.volume = 0;
                    this.audioB.volume = 0;
                } else {
                    if(!this.isCrossfading) {
                        this.active.volume = this.targetVolume;
                        this.inactive.volume = 0;
                    }
                }
            }

            unlock() {
                if(this.src) {
                    var self = this;
                    this.audioA.play().catch(function(){}); this.audioA.pause(); this.audioA.currentTime = 0;
                    this.audioB.play().catch(function(){}); this.audioB.pause(); this.audioB.currentTime = 0;
                }
            }

            doCrossfade(fadeTime) {
                if (this.isCrossfading || !this.isPlaying) return;
                this.isCrossfading = true;

                var fadingOut = this.active;
                var fadingIn = this.inactive;

                fadingIn.currentTime = 0;
                fadingIn.volume = 0;
                fadingIn.play().catch(function(){});

                var steps = 25; 
                var stepTime = (fadeTime * 1000) / steps;
                var volStep = this.targetVolume / steps;

                var currentStep = 0;
                var self = this;

                this.crossfadeInterval = setInterval(function(){
                    currentStep++;
                    if (currentStep >= steps) {
                        clearInterval(self.crossfadeInterval);
                        self.crossfadeInterval = null; // ← null 초기화
                        fadingOut.pause();
                        fadingOut.currentTime = 0;
                        fadingIn.volume = self.isMuted ? 0 : self.targetVolume;
                        self.active = fadingIn;
                        self.inactive = fadingOut;
                        self.isCrossfading = false;
                    } else {
                        if(!self.isMuted) {
                            fadingOut.volume = Math.max(0, self.targetVolume - (volStep * currentStep));
                            fadingIn.volume = Math.min(self.targetVolume, volStep * currentStep);
                        }
                    }
                }, stepTime);
            }
        }

        // ==========================================
        // 1. 다국어 딕셔너리
        // ==========================================
        const i18n = {
            ko: {
                greetingMorning: "좋은 아침입니다", greetingAfternoon: "좋은 오후입니다", greetingEvening: "편안한 저녁입니다", greetingNight: "고요한 밤입니다",
                currentMood: "(지금 선택된 무드)", min5: "5분", min10: "10분", min15: "15분", customTime: "설정", startMeditation: "명상 시작하기",
                mixerTitle: "사운드 믹서", bellStartEnd: "시작/종료 종소리", bellInterval: "중간 환기 종소리",
                libraryTitle: "사운드 라이브러리", freePresets: "무료 프리셋", premiumPresets: "프리미엄 프리셋", seeAll: "모두 보기",
                journeyTitle: "나의 여정", totalTimeLabel: "총 수련 시간", minuteUnit: "분", streakLabel: "연속 달성일", dayUnit: "일",
                settingsMeditationTitle: "명상 설정", languageSettings: "언어 (Language)", bellSettings: "명상 종소리", dndMode: "방해 금지 모드", dndDesc: "명상 중 알림 음소거 (예정)",
                themeSettings: "테마 설정 (Theme)", themeModalTitle: "테마 설정", themeLight: "라이트 모드", themeDark: "다크 모드", themeAuto: "자동",
                settingsSubTitle: "구독 및 계정", subPlan: "구독 플랜", subStatusFree: "무료 베이직 플랜", upgrade: "업그레이드", restorePurchase: "구매 복원",
                navHome: "홈", navLibrary: "라이브러리", navJourney: "여정", customTimeTitle: "명상 시간 설정", confirm: "확인", cancelBtn: "취소", alertTitle: "알림",
                languageSettingsTitle: "언어 설정", bellModalTitle: "종소리 라이브러리", 
                bellNone: "종소리 없음 (None)", bellTibetan: "사원의 종소리", bellCrystal: "크리스탈 볼", bellGong: "깊은 징",
                paywallDesc: "모든 프리미엄 사운드와 커스텀 기능을<br>잠금 해제하고 더 깊은 휴식을 경험하세요.", meditationBackBlocked: "명상 중에는 화면의 버튼으로 종료하세요.",
                payYearly: "연간 구독", payYearlyPrice: "월 $4.99 / 연 $59.99", payTrial: "7일 무료", payMonthly: "월간 구독", payMonthlyPrice: "$9.99 / 월", payStart: "무료 체험 시작하기",
                paywallDemoAlert: "결제 시스템 데모입니다.", finishMsg: "수고하셨습니다. 명상 세션이 완료되었습니다.", restoreMsgLoading: "구매 내역을 확인 중입니다...", restoreMsgSuccess: "구매 복원이 완료되었습니다.", breatheIn: "숨을 들이마십니다", breatheOut: "천천히 내뱉습니다",
                resetData: "여정 데이터 초기화", resetConfirmMsg: "모든 명상 기록과 통계가 삭제됩니다. 정말 초기화하시겠습니까?", resetDoneMsg: "모든 여정 데이터가 초기화되었습니다.", analysisTitle: "여정 분석", mostUsedSound: "가장 자주 머문 무드", favoriteTime: "가장 선호하는 시간대", timeMorning: "아침 (5AM - 12PM)", timeAfternoon: "오후 (12PM - 6PM)", timeEvening: "저녁 (6PM - 10PM)", timeNight: "밤 (10PM - 5AM)", notEnoughData: "데이터 부족"
            },
            en: {
                greetingMorning: "Good Morning", greetingAfternoon: "Good Afternoon", greetingEvening: "Good Evening", greetingNight: "Good Night",
                currentMood: "(CURRENT MOOD)", min5: "5 Min", min10: "10 Min", min15: "15 Min", customTime: "Custom", startMeditation: "Start Meditation",
                mixerTitle: "Sound Mixer", bellStartEnd: "Start/End Bell", bellInterval: "Interval Bell",
                libraryTitle: "Sound Library", freePresets: "Free Presets", premiumPresets: "Premium Presets", seeAll: "See All",
                journeyTitle: "Your Journey", totalTimeLabel: "Total Time", minuteUnit: "Min", streakLabel: "Current Streak", dayUnit: "Days",
                settingsMeditationTitle: "Meditation Settings", languageSettings: "Language", bellSettings: "Meditation Bell", dndMode: "Do Not Disturb", dndDesc: "Mute notifications (Upcoming)",
                themeSettings: "App Theme", themeModalTitle: "Select Theme", themeLight: "Light Mode", themeDark: "Dark Mode", themeAuto: "Auto",
                settingsSubTitle: "Subscription & Account", subPlan: "Your Plan", subStatusFree: "Free Basic Plan", upgrade: "Upgrade", restorePurchase: "Restore Purchase",
                navHome: "Home", navLibrary: "Library", navJourney: "Journey", customTimeTitle: "Set Custom Time", confirm: "Confirm", cancelBtn: "Cancel", alertTitle: "Notice",
                languageSettingsTitle: "Select Language", bellModalTitle: "Bell Library", bellNone: "None", bellTibetan: "Tibetan Bowl", bellCrystal: "Crystal Bowl", bellGong: "Deep Gong",
                paywallDesc: "Unlock all premium sounds and custom features<br>to experience deeper relaxation.", meditationBackBlocked: "Use the stop button to end meditation.", payYearly: "Yearly", payYearlyPrice: "$4.99 / mo (Billed $59.99/yr)", payTrial: "7 Days Free", payMonthly: "Monthly", payMonthlyPrice: "$9.99 / mo", payStart: "Start Free Trial",
                paywallDemoAlert: "Payment gateway demo.", finishMsg: "Great job. Your meditation session is complete.", restoreMsgLoading: "Checking store purchases...", restoreMsgSuccess: "Purchase successfully restored.", breatheIn: "Breathe in", breatheOut: "Breathe out slowly",
                resetData: "Reset Journey Data", resetConfirmMsg: "All meditation history will be deleted. Are you sure?", resetDoneMsg: "Journey data has been reset.", analysisTitle: "Journey Analysis", mostUsedSound: "Most Visited Mood", favoriteTime: "Favorite Time of Day", timeMorning: "Morning", timeAfternoon: "Afternoon", timeEvening: "Evening", timeNight: "Night", notEnoughData: "Not enough data"
            },
            es: {
                greetingMorning: "Buenos días", greetingAfternoon: "Buenas tardes", greetingEvening: "Buenas tardes", greetingNight: "Buenas noches",
                currentMood: "(ESTADO ACTUAL)", min5: "5 min", min10: "10 min", min15: "15 min", customTime: "Personal.", startMeditation: "Empezar Meditación",
                mixerTitle: "Mezclador", bellStartEnd: "Campana Inicio/Fin", bellInterval: "Campana de Intervalo", libraryTitle: "Biblioteca de Sonidos", freePresets: "Gratis", premiumPresets: "Premium", seeAll: "Ver todo",
                journeyTitle: "Tu Viaje", totalTimeLabel: "Tiempo Total", minuteUnit: "min", streakLabel: "Racha Actual", dayUnit: "días", settingsMeditationTitle: "Ajustes de Meditación", languageSettings: "Idioma", bellSettings: "Campana", dndMode: "No Molestar", dndDesc: "Silenciar notificaciones (Próximamente)", themeSettings: "Tema", themeModalTitle: "Seleccionar Tema", themeLight: "Modo Claro", themeDark: "Modo Oscuro", themeAuto: "Automático",
                settingsSubTitle: "Suscripción y Cuenta", subPlan: "Tu Plan", subStatusFree: "Plan Básico", upgrade: "Mejorar", restorePurchase: "Restaurar Compra",
                navHome: "Inicio", navLibrary: "Biblioteca", navJourney: "Viaje", customTimeTitle: "Tiempo", confirm: "Confirmar", cancelBtn: "Cancelar", alertTitle: "Aviso",
                languageSettingsTitle: "Seleccionar Idioma", bellModalTitle: "Campanas", bellNone: "Ninguna", bellTibetan: "Cuenco Tibetano", bellCrystal: "Cuenco de Cristal", bellGong: "Gong Profundo",
                paywallDesc: "Desbloquea todos los sonidos premium y funciones<br>para experimentar una relajación más profunda.", meditationBackBlocked: "Usa el botón de parar para terminar.", payYearly: "Anual", payYearlyPrice: "$4.99/mes ($59.99/año)", payTrial: "7 Días Gratis", payMonthly: "Mensual", payMonthlyPrice: "$9.99 / mes", payStart: "Empezar Prueba",
                paywallDemoAlert: "Demostración de pago.", finishMsg: "Excelente trabajo. Tu sesión ha terminado.", restoreMsgLoading: "Buscando...", restoreMsgSuccess: "Compra restaurada.", breatheIn: "Inhala", breatheOut: "Exhala", resetData: "Reiniciar Datos", resetConfirmMsg: "Todo el historial será eliminado. ¿Estás seguro?", resetDoneMsg: "Los datos han sido reiniciados.", analysisTitle: "Análisis del Viaje", mostUsedSound: "Sonido Favorito", favoriteTime: "Momento Favorito", timeMorning: "Mañana", timeAfternoon: "Tarde", timeEvening: "Tarde/Noche", timeNight: "Noche", notEnoughData: "Sin datos"
            },
            zh: {
                greetingMorning: "早上好", greetingAfternoon: "下午好", greetingEvening: "晚上好", greetingNight: "晚安",
                currentMood: "(当前情绪)", min5: "5分钟", min10: "10分钟", min15: "15分钟", customTime: "自定义", startMeditation: "开始冥想", mixerTitle: "声音混音器", bellStartEnd: "开始/结束铃声", bellInterval: "间隔铃声", libraryTitle: "声音库", freePresets: "免费预设", premiumPresets: "高级预设", seeAll: "查看全部",
                journeyTitle: "您的旅程", totalTimeLabel: "总时长", minuteUnit: "分钟", streakLabel: "连续打卡", dayUnit: "天", settingsMeditationTitle: "冥想设置", languageSettings: "语言", bellSettings: "冥想铃声", dndMode: "勿扰模式", dndDesc: "冥想时静音通知 (即将推出)", themeSettings: "主题", themeModalTitle: "选择主题", themeLight: "浅色模式", themeDark: "深色模式", themeAuto: "自动",
                settingsSubTitle: "订阅与账户", subPlan: "您的计划", subStatusFree: "免费基础计划", upgrade: "升级", restorePurchase: "恢复购买", navHome: "首页", navLibrary: "音频库", navJourney: "旅程", customTimeTitle: "自定义时间", confirm: "确认", cancelBtn: "取消", alertTitle: "提示",
                languageSettingsTitle: "选择语言", bellModalTitle: "铃声库", bellNone: "无", bellTibetan: "西藏颂钵", bellCrystal: "水晶钵", bellGong: "深沉铜锣", paywallDesc: "解锁所有高级声音和自定义功能，<br>体验更深层次的放松。", meditationBackBlocked: "请使用停止按钮结束冥想。", payYearly: "年度订阅", payYearlyPrice: "每月 $4.99 / 每年 $59.99", payTrial: "免费试用", payMonthly: "月度订阅", payMonthlyPrice: "$9.99 / 月", payStart: "开始免费试用",
                paywallDemoAlert: "支付系统演示。", finishMsg: "辛苦了。您的冥想环节已完成。", restoreMsgLoading: "正在检查...", restoreMsgSuccess: "恢复成功。", breatheIn: "吸气", breatheOut: "呼气", resetData: "重置数据", resetConfirmMsg: "所有历史记录将被删除。确定吗？", resetDoneMsg: "数据已重置。", analysisTitle: "旅程分析", mostUsedSound: "最常用的声音", favoriteTime: "首选时间", timeMorning: "早晨", timeAfternoon: "下午", timeEvening: "傍晚", timeNight: "夜晚", notEnoughData: "数据不足"
            },
            ja: {
                greetingMorning: "おはようございます", greetingAfternoon: "こんにちは", greetingEvening: "こんばんは", greetingNight: "おやすみなさい",
                currentMood: "(現在のムード)", min5: "5分", min10: "10分", min15: "15分", customTime: "設定", startMeditation: "瞑想を始める", mixerTitle: "ミキサー", bellStartEnd: "開始/終了の鐘", bellInterval: "インターバルの鐘", libraryTitle: "ライブラリ", freePresets: "無料プリセット", premiumPresets: "プレミアム", seeAll: "すべて",
                journeyTitle: "記録", totalTimeLabel: "合計時間", minuteUnit: "分", streakLabel: "連続記録", dayUnit: "日", settingsMeditationTitle: "設定", languageSettings: "言語", bellSettings: "鐘", dndMode: "おやすみモード", dndDesc: "瞑想中の通知をミュート (予定)", themeSettings: "テーマ", themeModalTitle: "テーマ", themeLight: "ライト", themeDark: "ダーク", themeAuto: "自動",
                settingsSubTitle: "アカウント", subPlan: "プラン", subStatusFree: "無料プラン", upgrade: "アップグレード", restorePurchase: "購入の復元", navHome: "ホーム", navLibrary: "ライブラリ", navJourney: "記録", customTimeTitle: "時間", confirm: "確認", cancelBtn: "キャンセル", alertTitle: "お知らせ",
                languageSettingsTitle: "言語", bellModalTitle: "鐘", bellNone: "なし", bellTibetan: "チベットボウル", bellCrystal: "クリスタルボウル", bellGong: "ゴング", paywallDesc: "すべての機能をロック解除して、<br>より深いリラクゼーションを。", meditationBackBlocked: "停止ボタンで瞑想を終了してください。", payYearly: "年間", payYearlyPrice: "月額 $4.99 / 年額 $59.99", payTrial: "7日間無料", payMonthly: "月間", payMonthlyPrice: "$9.99 / 月", payStart: "無料トライアル",
                paywallDemoAlert: "デモです。", finishMsg: "お疲れ様でした。", restoreMsgLoading: "確認中...", restoreMsgSuccess: "復元しました。", breatheIn: "息を吸って", breatheOut: "息を吐いて", resetData: "データ初期化", resetConfirmMsg: "全ての記録が削除されます。よろしいですか？", resetDoneMsg: "初期化されました。", analysisTitle: "記録分析", mostUsedSound: "よく聴くサウンド", favoriteTime: "よく瞑想する時間帯", timeMorning: "朝", timeAfternoon: "昼", timeEvening: "夕方", timeNight: "夜", notEnoughData: "データなし"
            }
        };

        const quotesData = {
            ko: [ "지금 아무것도 하지 않는 시간을 자신에게 허락하세요.", "바쁘게 달려온 하루, 잠시 숨을 고를 시간입니다.", "모든 것을 내려놓고, 오직 지금 이 순간에 머물러보세요." ],
            en: [ "Give yourself permission to do nothing for a moment.", "It's time to take a breath after a busy day.", "Let go of everything and just be in the present moment." ],
            es: [ "Date permiso para no hacer nada por un momento.", "Es hora de tomar un respiro después de un día ajetreado.", "Suelta todo y simplemente está en el momento presente." ],
            zh: [ "允许自己此刻无所事事。", "忙碌了一天，是时候喘口气了。", "放下一切，只停留在当下的瞬间。" ],
            ja: [ "今、何もしない時間を自分に許してあげましょう。", "忙しい一日を終え、一息つく時間です。", "すべてを手放し、ただこの瞬間に留まってみましょう。" ]
        };

        const langNames = { ko: "한국어", en: "English", es: "Español", zh: "中文", ja: "日本語" };

        // ==========================================
        // 2. 상태 변수
        // ==========================================
        const STORAGE_KEY = 'neul_meditation_data';
        let userData = {
            lang: null, theme: 'auto', bell: 'tibetan', presetIndex: 0,
            totalTime: 0, streak: 0, lastDate: null, history: [],
            volAsmr: 0.7, volAmbient: 0.3, volBowl: 0.5, volAnchor: 0.3,
            dndMode: false
        };

        let currentLang = 'en'; 
        let currentThemeSetting = 'auto'; 
        let selectedMinutes = 15; let seconds = selectedMinutes * 60; let customBtnElement = null;
        let isMeditating = false; let meditationTimer, breathInterval, randomChimeTimer;
        let breathCycle = 0; let audioUnlocked = false; let currentBell = 'tibetan'; 
        let isSubscribed = false; let isMuted = false; let currentPresetIndex = 0;

        let isProcessingAction = false; 
        let bellPreviewTimeout = null;

        let activeModals = [];
        let confirmAction = null;
        
        // 뒤로가기 관련 (앱 무단 종료 방지)
        // v1.6.7: replaceState 방식으로 변경되어 lastBackPressTime, programmaticBackCount 불필요

        let audioAsmr, audioAmbient;
        
        const audioBowl = document.getElementById('audio-bowl');
        const audioAnchor = document.getElementById('audio-anchor');
        const previewAudio = new Audio(); 

        const bells = {
            tibetan: './assets/audio/bell/tibetan.mp3',
            crystal: './assets/audio/bell/crystal.mp3',
            gong: './assets/audio/bell/gong.mp3'
        };

        let appPresets = [
            { type: 'free', title: 'Deep Forest Rain', img: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&q=60&w=400', asmr: './assets/audio/free/forest-rain-asmr.mp3', ambient: './assets/audio/free/forest-rain-ambient.mp3' },
            { type: 'free', title: 'Cozy Campfire', img: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&q=60&w=400', asmr: './assets/audio/free/campfire-asmr.mp3', ambient: './assets/audio/free/campfire-ambient.mp3' },
            { type: 'free', title: 'Ocean Waves', img: 'https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&q=60&w=400', asmr: './assets/audio/free/ocean-asmr.mp3', ambient: './assets/audio/free/ocean-ambient.mp3' }, 
            { type: 'free', title: 'Mountain Wind', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=60&w=400', asmr: './assets/audio/free/mountain-asmr.mp3', ambient: './assets/audio/free/mountain-ambient.mp3' },
            { type: 'premium', title: 'Celestial Dreams', img: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=60&w=400', asmr: './assets/audio/premium/premium1-asmr.mp3', ambient: './assets/audio/premium/premium1-ambient.mp3' }
        ];

        document.addEventListener('DOMContentLoaded', () => {
            // === v1.6.5: history buffer 시스템 ===
            // 모바일 OS의 빠른 뒤로가기에 대비해 "buffer guard" 1개를 항상 스택 위에 유지.
            // 스택 구조: [home_base, home_guard, (선택적) meditation, (선택적) modal...]
            // 어떤 popstate가 발생해도 guard가 흡수해주므로 앱이 실수로 종료되지 않음.
            history.replaceState({ page: 'home_base' }, "", "");
            history.pushState({ page: 'home_guard' }, "", "");

            audioAsmr = new DualAudioPlayer();
            audioAmbient = new DualAudioPlayer();

            loadUserData();
            initLanguageSystem(); initThemeSystem(); initMixer();
            renderLists(); updateJourneyUI(); 
            
            document.getElementById('dnd-toggle').checked = userData.dndMode;

            changeMood(userData.presetIndex, false);
            changeBell(userData.bell, false);

            customBtnElement = document.getElementById('btn-custom');
            updateActiveState('.lang-btn', 'lang-' + currentLang);
            updateActiveState('.bell-btn', 'bell-' + currentBell);
            updateActiveState('.theme-btn', 'theme-' + currentThemeSetting);
        });

        function loadUserData() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if(saved) {
                try {
                    userData = { ...userData, ...JSON.parse(saved) };
                } catch(e) {
                    console.warn('userData parse failed, using defaults');
                }
            }
            if(userData.lang) currentLang = userData.lang;
            if(userData.theme) currentThemeSetting = userData.theme;
        }

        function saveUserData() { 
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); }
            catch(e) { console.warn('saveUserData failed', e); }
        }

        // ==========================================
        // History API 라우팅 (v1.6.7: replaceState 방식)
        // ==========================================
        // 설계:
        //   - 모달 닫기(버튼/백드롭): replaceState로 guard 덮어씀 → popstate 발생 안 함
        //   - 모달 닫기(뒤로가기): popstate 발생 → 아래 핸들러에서 처리
        //   - 명상 뒤로가기: 완전 차단, guard 재push
        //   - 홈 뒤로가기: guard 재push (앱 종료 방지)
        window.addEventListener('popstate', function(e) {
            // 1. 모달이 열려있으면 뒤로가기로 닫힌 것 → DOM 닫고 guard 보충
            if(activeModals.length > 0) {
                const modalId = activeModals.pop();
                hideModalDOM(modalId);
                const guardState = isMeditating
                    ? { page: 'meditation_guard' }
                    : { page: 'home_guard' };
                history.pushState(guardState, "", "");
                return;
            }

            // 2. 명상 중 뒤로가기 → 완전 차단, guard 재push, 토스트
            if (isMeditating) {
                history.pushState({ page: 'meditation_guard' }, "", "");
                showToast(getI18nStr('meditationBackBlocked'));
                return;
            }

            // 3. 홈 화면에서 뒤로가기 → guard 재push (앱 종료 방지)
            history.pushState({ page: 'home_guard' }, "", "");
        });

        // ==========================================
        // 모달 오픈/클로즈 (v1.6.7)
        // ==========================================
        // 핵심 설계 변경:
        // - 모달 열기: pushState({modalId}) — 뒤로가기로 닫을 수 있는 entry 추가
        // - 모달 닫기(버튼): history.back() 를 절대 호출하지 않음.
        //   대신 현재 history entry를 replaceState로 guard로 덮어씀.
        //   → 브라우저가 "뒤로 가는" 동작을 수행하지 않으므로 화면 밀림/깜박임 없음.
        // - 모달 닫기(뒤로가기): popstate에서 처리. 이미 pop이 된 상태이므로 pushState로 guard 보충.

        function openModal(modalId) {
            if (activeModals.includes(modalId)) return;
            const modal = document.getElementById(modalId);
            if (!modal) return;
            modal.classList.remove('hidden');
            setTimeout(function() {
                modal.classList.remove('opacity-0');
                modal.classList.add('modal-active');
            }, 10);
            activeModals.push(modalId);
            // 이 모달 entry를 history에 추가 (뒤로가기로 닫을 수 있도록)
            history.pushState({ modalId: modalId }, "", "");
            if(modalId === 'modal-analysis') updateAnalysisUI();
        }

        // 백드롭(overlay 자체) 클릭만 닫기
        function onOverlayClick(event, modalId) {
            if (event && event.target.id === modalId) {
                closeModal(modalId);
            }
        }

        function closeModal(modalId) {
            const index = activeModals.indexOf(modalId);
            if(index > -1) {
                activeModals.splice(index, 1);
            }
            hideModalDOM(modalId);

            // history.back() 을 호출하지 않고 현재 entry를 guard로 덮어씀.
            // 이렇게 하면 브라우저가 "뒤로 이동" 애니메이션을 실행하지 않아
            // 화면 밀림/깜박임이 발생하지 않는다.
            // 스택에서 modal entry가 남아있지만 다음 popstate에서 guard로 흡수됨.
            const guardState = isMeditating
                ? { page: 'meditation_guard' }
                : { page: 'home_guard' };
            history.replaceState(guardState, "", "");
        }

        function hideModalDOM(modalId) {
            const modal = document.getElementById(modalId);
            if(modal) {
                modal.classList.remove('modal-active');
                modal.classList.add('opacity-0');
                setTimeout(function() { modal.classList.add('hidden'); }, 400);
            }
        }

        let toastTimeout;
        function showToast(msg) {
            const toast = document.getElementById('toast-container');
            if(toast) {
                toast.firstElementChild.innerText = msg;
                toast.classList.remove('opacity-0');
                clearTimeout(toastTimeout);
                toastTimeout = setTimeout(() => { toast.classList.add('opacity-0'); }, 2000);
            }
        }

        function showAlert(msg, titleKey = 'alertTitle') {
            document.getElementById('alert-title').innerText = getI18nStr(titleKey) || "알림";
            document.getElementById('alert-message').innerHTML = msg;
            openModal('modal-alert');
        }
        function showConfirm(msg, onConfirm) {
            document.getElementById('confirm-message').innerText = msg;
            confirmAction = onConfirm;
            openModal('modal-confirm');
        }
        function executeConfirm() {
            const action = confirmAction;
            confirmAction = null;
            closeModal('modal-confirm');
            if(action) action();
        }

        function updateActiveState(selectorGroup, activeId) {
            document.querySelectorAll(selectorGroup).forEach(btn => {
                if(btn.id === activeId) {
                    btn.classList.remove('border-glass-border', 'bg-glass-bg', 'hover:bg-glass-bg-hover');
                    btn.classList.add('border-primary', 'bg-primary/10');
                    const textSpan = btn.querySelector('span:first-child');
                    if(textSpan) { textSpan.classList.remove('text-tertiary', 'font-medium'); textSpan.classList.add('text-primary', 'font-bold'); }
                    if(!btn.querySelector('.icon-check')) btn.insertAdjacentHTML('beforeend', `<span class="material-symbols-outlined text-primary text-xl icon-check">check_circle</span>`);
                } else {
                    btn.classList.remove('border-primary', 'bg-primary/10');
                    btn.classList.add('border-glass-border', 'bg-glass-bg', 'hover:bg-glass-bg-hover');
                    const textSpan = btn.querySelector('span:first-child');
                    if(textSpan) { textSpan.classList.remove('text-primary', 'font-bold'); textSpan.classList.add('text-tertiary', 'font-medium'); }
                    const checkIcon = btn.querySelector('.icon-check'); if(checkIcon) checkIcon.remove();
                }
            });
        }

        function initMixer() {
            const setupSlider = (sliderId, labelId, key, callback) => {
                const slider = document.getElementById(sliderId); const label = document.getElementById(labelId);
                slider.value = userData[key] * 100; label.innerText = `${Math.round(userData[key] * 100)}%`;
                slider.addEventListener('input', (e) => {
                    const val = e.target.value / 100; label.innerText = `${e.target.value}%`; 
                    userData[key] = val; saveUserData(); callback(val);
                });
            };
            
            setupSlider('slider-asmr', 'label-asmr-vol', 'volAsmr', (v) => { audioAsmr.setVolume(v); });
            setupSlider('slider-ambient', 'label-ambient-vol', 'volAmbient', (v) => { audioAmbient.setVolume(v); });
            setupSlider('slider-bowl', 'label-bowl-vol', 'volBowl', (v) => { if(!isMuted) audioBowl.volume = v; });
            setupSlider('slider-anchor', 'label-anchor-vol', 'volAnchor', (v) => { if(!isMuted) audioAnchor.volume = v; });
            
            audioAsmr.setVolume(userData.volAsmr);
            audioAmbient.setVolume(userData.volAmbient); 
            audioBowl.volume = userData.volBowl; 
            audioAnchor.volume = userData.volAnchor;
        }

        function initLanguageSystem() {
            if (!userData.lang) {
                const sysLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
                if (sysLang.startsWith('ko')) currentLang = 'ko'; else if (sysLang.startsWith('es')) currentLang = 'es';
                else if (sysLang.startsWith('zh')) currentLang = 'zh'; else if (sysLang.startsWith('ja')) currentLang = 'ja';
                else currentLang = 'en';
            }
            applyTranslations(); updateDynamicText();
            document.getElementById('current-language-label').innerText = langNames[currentLang];
        }

        function setLanguage(langCode) {
            currentLang = langCode; userData.lang = langCode; saveUserData();
            applyTranslations(); updateDynamicText(); updateJourneyUI(); 
            document.getElementById('current-language-label').innerText = langNames[langCode];
            updateActiveState('.lang-btn', 'lang-' + langCode);
            changeBell(currentBell, false); setTheme(currentThemeSetting); closeModal('modal-language');
        }

        function applyTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n'); if (i18n[currentLang][key]) el.innerHTML = i18n[currentLang][key];
            });
            if(customBtnElement && selectedMinutes !== 5 && selectedMinutes !== 10 && selectedMinutes !== 15) {
                customBtnElement.innerHTML = `<span class="font-bold">${selectedMinutes}${getI18nStr('minuteUnit')}</span>`;
            }
        }
        function getI18nStr(key) { return i18n[currentLang][key] || i18n.en[key] || key; }

        function updateDynamicText() {
            const hour = new Date().getHours(); let greetingKey = "greetingEvening";
            if (hour >= 5 && hour < 12) greetingKey = "greetingMorning"; else if (hour >= 12 && hour < 18) greetingKey = "greetingAfternoon"; else if (hour >= 18 && hour < 22) greetingKey = "greetingEvening"; else greetingKey = "greetingNight";
            document.getElementById('greeting-title').innerText = getI18nStr(greetingKey);
            const quotes = quotesData[currentLang] || quotesData.en; document.getElementById('greeting-quote').innerText = `"${quotes[Math.floor(Math.random() * quotes.length)]}"`;
        }

        function initThemeSystem() { setTheme(userData.theme); }
        function setTheme(mode) {
            currentThemeSetting = mode; userData.theme = mode; saveUserData();
            let isDark = (mode === 'auto') ? (new Date().getHours() >= 18 || new Date().getHours() < 6) : (mode === 'dark');
            if (isDark) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
            const labelKey = mode === 'auto' ? 'themeAuto' : (mode === 'dark' ? 'themeDark' : 'themeLight');
            document.getElementById('current-theme-label').innerText = getI18nStr(labelKey);
            updateActiveState('.theme-btn', 'theme-' + mode);
        }

        function toggleDND() {
            userData.dndMode = !userData.dndMode;
            saveUserData();
            document.getElementById('dnd-toggle').checked = userData.dndMode;
        }

        function renderLists() {
            renderListHTML('free-presets-container', 'free', false);
            renderListHTML('premium-presets-container', 'premium', false);
        }

        function renderListHTML(containerId, filterType, isGrid) {
            const container = document.getElementById(containerId); 
            container.innerHTML = ''; 
            let html = '';
            appPresets.forEach((p, index) => {
                if (p.type !== filterType) return;
                const isLock = p.type === 'premium' && !isSubscribed;
                const action = isLock ? `openPaywall()` : `changeMood(${index})`;
                const opacityClass = isLock ? 'opacity-80 grayscale-[30%]' : '';
                const lockIcon = isLock ? `<div class="absolute top-2 right-2 bg-black/50 rounded-full p-1"><span class="material-symbols-outlined text-[14px] text-white">lock</span></div>` : '';
                const baseClass = isGrid ? `w-full aspect-square rounded-2xl` : `w-36 aspect-square shrink-0 snap-start rounded-2xl`;
                
                html += `<div onclick="${action}; ${isGrid ? "closeModal('modal-all-presets');" : ""}" class="${baseClass} overflow-hidden relative shadow-md cursor-pointer active:scale-95 transition-transform ${opacityClass}">
                    <img class="absolute inset-0 w-full h-full object-cover" src="${p.img}"/>
                    ${lockIcon}
                    <div class="absolute bottom-0 w-full p-2 bg-gradient-to-t from-black/80 to-transparent"><h4 class="text-white text-sm font-serif">${p.title}</h4></div>
                </div>`;
            });
            container.innerHTML = html;
        }

        function switchTab(tabId) {
            ['home', 'player', 'journey'].forEach(t => {
                const el = document.getElementById(`tab-${t}`); const navBtn = document.getElementById(`nav-${t}`);
                el.classList.remove('z-10', 'opacity-100', 'pointer-events-auto'); el.classList.add('z-0', 'opacity-0', 'pointer-events-none');
                navBtn.classList.remove('text-primary'); navBtn.classList.add('text-tertiary', 'opacity-50'); navBtn.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 0";
            });
            const targetEl = document.getElementById(`tab-${tabId}`); const activeNav = document.getElementById(`nav-${tabId}`);
            targetEl.classList.remove('z-0', 'opacity-0', 'pointer-events-none'); targetEl.classList.add('z-10', 'opacity-100', 'pointer-events-auto');
            activeNav.classList.remove('text-tertiary', 'opacity-50'); activeNav.classList.add('text-primary'); activeNav.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        }

        function selectTime(mins, btnElement) {
            if(mins === 'custom') { customBtnElement = btnElement || document.getElementById('btn-custom'); openModal('modal-custom-time'); return; }
            setTimeValue(mins, btnElement);
        }
        function applyCustomTime() {
            let val = parseInt(document.getElementById('input-custom-time').value);
            if(isNaN(val) || val <= 0) val = 15; if(val > 120) val = 120; 
            setTimeValue(val, customBtnElement); closeModal('modal-custom-time');
        }
        function setTimeValue(mins, btnElement) {
            selectedMinutes = mins; seconds = selectedMinutes * 60;
            document.querySelectorAll('.time-btn').forEach(btn => btn.className = "time-btn bg-glass-bg text-tertiary border border-glass-border hover:bg-glass-bg-hover rounded-full py-2 flex-1 text-xs font-bold transition-all");
            if(btnElement) btnElement.className = "time-btn bg-primary text-on-primary border border-primary shadow-md rounded-full py-2 flex-1 text-xs font-bold transition-all";
            const customBtn = document.getElementById('btn-custom');
            if(btnElement && btnElement.id === 'btn-custom') customBtn.innerHTML = `<span class="font-bold">${mins}${getI18nStr('minuteUnit')}</span>`;
            else customBtn.innerHTML = `<span>${getI18nStr('customTime')}</span>`;
        }

        // ==========================================
        // 무드 변경 (v1.6.4: 명상 중일 때 부드러운 크로스페이드)
        // ==========================================
        function changeMood(index, playImmediate = true) {
            if(isProcessingAction || !appPresets[index]) return;
            const p = appPresets[index]; currentPresetIndex = index;
            userData.presetIndex = index; saveUserData();
            document.getElementById('home-card-title').innerText = p.title;
            document.getElementById('home-card-img').src = p.img; 
            document.getElementById('meditation-bg-img').src = p.img;
            
            if (playImmediate && isMeditating) {
                // 명상 중: 부드러운 크로스페이드 전환
                audioAsmr.crossfadeToSrc(p.asmr, 2.5);
                audioAmbient.crossfadeToSrc(p.ambient, 2.5);
            } else {
                // 명상 중 아님: 단순 src 교체 (재생은 startMeditation에서)
                audioAsmr.setSrc(p.asmr);
                audioAmbient.setSrc(p.ambient);
                if (playImmediate) switchTab('home');
            }
        }

        function nextPreset() {
            if(isProcessingAction) return;
            const currentType = appPresets[currentPresetIndex].type;
            const typePresets = appPresets.map((p, i) => ({...p, index: i})).filter(p => p.type === currentType);
            const currentIndexInType = typePresets.findIndex(p => p.index === currentPresetIndex);
            const nextIndexInType = (currentIndexInType + 1) % typePresets.length;
            changeMood(typePresets[nextIndexInType].index);
        }

        function changeBell(bellType, playSound = true) {
            currentBell = bellType; userData.bell = bellType; saveUserData();
            const bellKeyMap = { none: 'bellNone', tibetan: 'bellTibetan', crystal: 'bellCrystal', gong: 'bellGong' };
            document.getElementById('current-bell-label').innerText = getI18nStr(bellKeyMap[bellType]);
            
            updateActiveState('.bell-btn', 'bell-' + bellType);
            
            if(bellType === 'none' || !bells[bellType]) { 
                audioBowl.src = ""; audioAnchor.src = ""; 
                clearTimeout(bellPreviewTimeout);
                try { previewAudio.pause(); } catch(e) {}
            } else { 
                audioBowl.src = bells[bellType]; audioAnchor.src = bells[bellType]; 
                // 명상 중에는 미리듣기 절대 재생하지 않음 (NEW v1.6.4)
                if(playSound && !isMeditating) { 
                    clearTimeout(bellPreviewTimeout);
                    try { previewAudio.pause(); previewAudio.currentTime = 0; } catch(e) {}
                    bellPreviewTimeout = setTimeout(() => {
                        previewAudio.src = bells[bellType]; 
                        previewAudio.play().catch(()=>{}); 
                    }, 150);
                }
            }
        }

        function toggleMute() {
            isMuted = !isMuted;
            
            audioAsmr.setMuted(isMuted);
            audioAmbient.setMuted(isMuted);
            audioBowl.muted = isMuted;
            audioAnchor.muted = isMuted;
            
            document.getElementById('icon-mute').innerText = isMuted ? 'volume_off' : 'volume_up';
        }

        function unlockAudio() {
            if(audioUnlocked) return;
            
            audioAsmr.unlock();
            audioAmbient.unlock();
            
            // bowl/anchor도 무음으로 한 번 깨워둔다
            audioAnchor.muted = true;
            audioAnchor.play().then(() => { 
                audioAnchor.pause(); 
                audioAnchor.muted = false; 
            }).catch(()=>{});
            
            audioUnlocked = true;
        }

        // ==========================================
        // 명상 시작 / 종료 (v1.6.4 - 페이드 개선, isProcessingAction 안전화)
        // ==========================================
        function startMeditation() {
            if(isMeditating || isProcessingAction) return; 
            isProcessingAction = true;
            
            try {
                // 명상 화면을 history에 push (home_guard 위에 쌓임)
                history.pushState({ page: 'meditation' }, "", "");

                unlockAudio(); 
                isMeditating = true;

                ['home', 'player', 'journey'].forEach(t => { 
                    const el = document.getElementById(`tab-${t}`); 
                    el.classList.remove('z-10', 'opacity-100', 'pointer-events-auto'); 
                    el.classList.add('z-0', 'opacity-0', 'pointer-events-none'); 
                });
                document.getElementById('bottom-nav').classList.add('translate-y-full');
                document.getElementById('app-container').classList.add('nav-hidden');
                const medView = document.getElementById('view-meditation');
                medView.classList.remove('z-0', 'opacity-0', 'pointer-events-none'); 
                medView.classList.add('z-50', 'opacity-100', 'pointer-events-auto');

                seconds = selectedMinutes * 60;
                updateTimerDisplay(); 

                // 시작 종소리를 먼저 울리고 ASMR/Ambient는 페이드인
                if(currentBell !== 'none' && bells[currentBell]) { 
                    audioBowl.volume = isMuted ? 0 : userData.volBowl;
                    audioBowl.muted = isMuted;
                    audioBowl.currentTime = 0; 
                    audioBowl.play().catch(()=>{}); 
                }
                
                // 사운드 페이드인 (1.5초) - 종소리가 묻히지 않게
                audioAsmr.setVolume(userData.volAsmr);
                audioAmbient.setVolume(userData.volAmbient);
                audioAsmr.playWithFadeIn(1.5);
                audioAmbient.playWithFadeIn(1.5);
                
                startBreathing();
                meditationTimer = setInterval(() => { 
                    seconds--; 
                    updateTimerDisplay(); 

                    // 마지막 8초에 부드러운 페이드아웃
                    if (seconds <= 8 && seconds > 0) {
                        const ratio = seconds / 8;
                        audioAsmr.setVolume(userData.volAsmr * ratio);
                        audioAmbient.setVolume(userData.volAmbient * ratio);
                    }

                    if(seconds <= 0) stopMeditation(true); 
                }, 1000);
                scheduleRandomChime();
            } finally {
                setTimeout(() => { isProcessingAction = false; }, 500);
            }
        }

        function stopMeditation(completed = false) {
            if(!isMeditating || isProcessingAction) return;
            isProcessingAction = true;
            
            try {
                isMeditating = false; 
                clearInterval(meditationTimer); 
                clearInterval(breathInterval); 
                clearTimeout(randomChimeTimer);
                
                // v1.6.7: history.back() 대신 replaceState로 home_guard 상태로 덮어씀
                // → 브라우저 뒤로가기 애니메이션 없음, 화면 밀림 없음
                history.replaceState({ page: 'home_guard' }, "", "");

                // 음원 페이드아웃 후 정지 (자연스러움 향상)
                // 단, 자동 완료(completed=true)일 때는 이미 8초간 페이드 중이었으므로 즉시 stop
                if (completed) {
                    audioAsmr.stop();
                    audioAmbient.stop();
                } else {
                    // 사용자 정지 / 뒤로가기 정지 → 1.5초 페이드아웃
                    audioAsmr.fadeOutAndStop(1.5);
                    audioAmbient.fadeOutAndStop(1.5);
                }
                
                // 다음 세션을 위해 볼륨을 원래 값으로 복원
                audioAsmr.setVolume(userData.volAsmr);
                audioAmbient.setVolume(userData.volAmbient);

                // 종료 종소리 (None 모드면 울리지 않음)
                if(currentBell !== 'none' && bells[currentBell]) { 
                    audioBowl.volume = isMuted ? 0 : userData.volBowl; 
                    audioBowl.muted = isMuted;
                    audioBowl.currentTime = 0; 
                    audioBowl.play().catch(()=>{}); 
                }
                
                const medView = document.getElementById('view-meditation');
                medView.classList.remove('z-50', 'opacity-100', 'pointer-events-auto'); 
                medView.classList.add('z-0', 'opacity-0', 'pointer-events-none');
                document.getElementById('bottom-nav').classList.remove('translate-y-full');
                document.getElementById('app-container').classList.remove('nav-hidden');
                switchTab('home'); 
                seconds = selectedMinutes * 60;
                updateTimerDisplay();
                
                if(completed) {
                    const today = new Date().toDateString();
                    userData.totalTime += selectedMinutes;
                    if(userData.lastDate !== today) { 
                        userData.streak += 1; 
                        userData.lastDate = today; 
                    }
                    userData.history.push({ 
                        preset: currentPresetIndex, 
                        duration: selectedMinutes, 
                        hour: new Date().getHours() 
                    });
                    saveUserData(); 
                    updateJourneyUI();
                    showAlert(getI18nStr('finishMsg'));
                }
            } finally {
                setTimeout(() => { isProcessingAction = false; }, 500);
            }
        }

        function updateTimerDisplay() { 
            let m = Math.floor(seconds / 60); let s = seconds % 60; 
            const el = document.getElementById('timer');
            if (el) el.innerText = `${m}:${s < 10 ? '0' + s : s}`; 
        }

        function scheduleRandomChime() {
            if(!isMeditating || currentBell === 'none' || !bells[currentBell]) return; 
            clearTimeout(randomChimeTimer); // 기존 타이머 보호
            const randomDelay = Math.floor(Math.random() * (240000 - 120000 + 1)) + 120000; 
            randomChimeTimer = setTimeout(() => { 
                if (!isMeditating) return; // 명상 종료된 경우 울리지 않음
                audioAnchor.volume = isMuted ? 0 : userData.volAnchor; 
                audioAnchor.muted = isMuted;
                audioAnchor.currentTime = 0; 
                audioAnchor.play().catch(()=>{}); 
                scheduleRandomChime(); 
            }, randomDelay);
        }

        function startBreathing() {
            const pebble = document.getElementById('breathing-pebble'); const text = document.getElementById('breath-text');
            breathCycle = 0; text.style.opacity = "1";
            const runCycle = () => {
                if(!isMeditating) return; 
                pebble.style.transform = "scale(1.4)"; 
                pebble.style.backgroundColor = "rgba(255, 255, 255, 0.4)";
                if (breathCycle < 3) text.innerText = getI18nStr('breatheIn'); else text.style.opacity = "0";
                setTimeout(() => { 
                    if(!isMeditating) return; 
                    pebble.style.transform = "scale(0.85)"; 
                    pebble.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                    if (breathCycle < 3) text.innerText = getI18nStr('breatheOut'); 
                    breathCycle++;
                }, 4000);
            }; 
            runCycle(); 
            breathInterval = setInterval(runCycle, 8000);
        }

        function openAllPresetsModal(type) { document.getElementById('all-presets-title').innerText = getI18nStr(type === 'free' ? 'freePresets' : 'premiumPresets'); renderListHTML('modal-presets-grid', type, true); openModal('modal-all-presets'); }
        function openPaywall() { openModal('modal-paywall'); }

        function restorePurchase() {
            showAlert(getI18nStr('restoreMsgLoading'));
            setTimeout(() => {
                isSubscribed = true; 
                document.getElementById('subscription-status').innerText = "Premium Lifetime";
                document.getElementById('subscription-status').classList.replace("text-tertiary", "text-primary"); 
                document.getElementById('subscription-status').classList.add("font-bold");
                renderLists(); 
                showAlert(getI18nStr('restoreMsgSuccess'));
            }, 1500);
        }

        function updateJourneyUI() {
            document.getElementById('stat-time').innerHTML = `${userData.totalTime} <span class="text-sm font-sans font-normal opacity-80">${getI18nStr('minuteUnit')}</span>`;
            document.getElementById('stat-streak').innerHTML = `${userData.streak} <span class="text-sm font-sans font-normal opacity-80">${getI18nStr('dayUnit')}</span>`;
        }

        function promptResetJourney() {
            showConfirm(getI18nStr('resetConfirmMsg'), () => {
                userData.totalTime = 0; userData.streak = 0; userData.lastDate = null; userData.history = [];
                saveUserData(); updateJourneyUI(); showAlert(getI18nStr('resetDoneMsg'));
            });
        }

        // 분석 - history 비어있을 때 / 0번 프리셋 버그 수정 (v1.6.4)
        function updateAnalysisUI() {
            if(!userData.history || userData.history.length === 0) {
                document.getElementById('analysis-top-preset').innerText = getI18nStr('notEnoughData');
                document.getElementById('analysis-top-time').innerText = getI18nStr('notEnoughData');
                return;
            }
            let presetCounts = {}; 
            let maxPresetId = -1;  // -1 sentinel
            let maxCount = 0;
            let timeCounts = { morning:0, afternoon:0, evening:0, night:0 };
            
            userData.history.forEach(session => {
                presetCounts[session.preset] = (presetCounts[session.preset] || 0) + 1;
                if(presetCounts[session.preset] > maxCount) { 
                    maxCount = presetCounts[session.preset]; 
                    maxPresetId = session.preset; 
                }
                
                let h = session.hour;
                if(h >= 5 && h < 12) timeCounts.morning++; 
                else if (h >= 12 && h < 18) timeCounts.afternoon++; 
                else if (h >= 18 && h < 22) timeCounts.evening++; 
                else timeCounts.night++;
            });

            const topPresetTitle = (maxPresetId >= 0 && appPresets[maxPresetId]) ? appPresets[maxPresetId].title : "-";
            document.getElementById('analysis-top-preset').innerText = topPresetTitle;
            
            let topTimeKey = Object.keys(timeCounts).reduce((a, b) => timeCounts[a] >= timeCounts[b] ? a : b);
            const timeLabels = { morning: 'timeMorning', afternoon: 'timeAfternoon', evening: 'timeEvening', night: 'timeNight' };
            document.getElementById('analysis-top-time').innerText = getI18nStr(timeLabels[topTimeKey]);
        }
