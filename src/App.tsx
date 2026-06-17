import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Car,
  Shield,
  TrendingDown,
  Wallet,
  Calendar,
  Percent,
  Banknote,
  CreditCard,
  Calculator,
  ChevronDown,
  Tag,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface Variant {
  name: string;
  otr: number;
  insurance: number;
}

interface CarModel {
  id: string;
  name: string;
  shortName: string;
  image: string;
  video?: string;
  variants: Variant[];
}

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const CAR_MODELS: CarModel[] = [
  {
    id: "saga",
    name: "SAGA",
    shortName: "SAGA",
    image: "/images/saga.jpg",
    video: "/cars/saga.mp4",
    variants: [
      { name: "Standard 1.5 i-GT 4AT", otr: 40400, insurance: 1410 },
      { name: "Executive 1.5 i-GT 4AT", otr: 46570, insurance: 1580 },
      { name: "Premium 1.5 i-GT CVT", otr: 51710, insurance: 1720 },
    ],
  },
  {
    id: "persona",
    name: "PERSONA",
    shortName: "PERSONA",
    image: "/images/persona.jpg",
    variants: [
      { name: "Standard 1.6 CVT", otr: 49560, insurance: 1760 },
      { name: "Executive 1.6 CVT", otr: 55220, insurance: 1920 },
      { name: "Premium 1.6 CVT", otr: 60360, insurance: 2060 },
    ],
  },
  {
    id: "s70",
    name: "S70",
    shortName: "S70",
    image: "/images/s70.jpg",
    variants: [
      { name: "Executive 1.5T i-GT DCT", otr: 76480, insurance: 2680 },
      { name: "Premium 1.5T i-GT DCT", otr: 82660, insurance: 2860 },
      { name: "Flagship 1.5T i-GT DCT", otr: 92950, insurance: 3150 },
      { name: "Flagship X 1.5T i-GT DCT", otr: 98100, insurance: 3300 },
    ],
  },
  {
    id: "x50",
    name: "X50",
    shortName: "X50",
    image: "/images/x50.jpg",
    video: "/cars/x50.mp4",
    variants: [
      { name: "Standard 1.5T i-GT DCT", otr: 86000, insurance: 2500 },
      { name: "Executive 1.5T i-GT DCT", otr: 92700, insurance: 2900 },
      { name: "Premium 1.5T i-GT DCT", otr: 105070, insurance: 3270 },
      { name: "Flagship 1.5T i-GT DCT", otr: 116900, insurance: 3600 },
    ],
  },
  {
    id: "x70",
    name: "X70",
    shortName: "X70",
    image: "/images/x70.jpg",
    variants: [
      { name: "Standard 1.5T i-GT DCT", otr: 102500, insurance: 2600 },
      { name: "Executive 1.5T i-GT DCT", otr: 110320, insurance: 3520 },
      { name: "Premium 1.5T i-GT DCT", otr: 123680, insurance: 3880 },
      { name: "Premium X 1.5T i-GT DCT", otr: 127000, insurance: 3100 },
    ],
  },
  {
    id: "x90",
    name: "X90",
    shortName: "X90",
    image: "/images/x90.jpg",
    video: "/cars/x90.mp4",
    variants: [
      { name: "Executive 1.5T i-GT Hybrid DCT", otr: 109650, insurance: 2850 },
      { name: "Premium 1.5T i-GT Hybrid DCT", otr: 119870, insurance: 3070 },
      { name: "Flagship 1.5T i-GT Hybrid DCT", otr: 126010, insurance: 3600 },
    ],
  },
  {
    id: "emas5",
    name: "e.MAS 5",
    shortName: "E5",
    image: "/images/e5.jpg",
    variants: [
      { name: "Prime EV", otr: 62800, insurance: 2800 },
      { name: "Premium EV", otr: 75800, insurance: 3000 },
    ],
  },
  {
    id: "emas7",
    name: "e.MAS 7 EV",
    shortName: "E7 EV",
    image: "/images/e7.jpg",
    variants: [
      { name: "Prime EV", otr: 103800, insurance: 3379 },
      { name: "Premium EV", otr: 119800, insurance: 3689 },
      { name: "Premium Plus EV", otr: 125800, insurance: 3900 },
    ],
  },
  {
    id: "emas7phev",
    name: "e.MAS 7 PHEV",
    shortName: "E7 PHEV",
    image: "/images/e7phev.jpg",
    variants: [
      { name: "PHEV Prime", otr: 113631, insurance: 3811 },
      { name: "PHEV Premium", otr: 128015, insurance: 4195 },
      { name: "PHEV Premium Plus", otr: 134179, insurance: 4359 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                          */
/* ------------------------------------------------------------------ */

const OTR_MODES = ["Dengan Insurans", "Tanpa Insurans"] as const;
type OtrMode = (typeof OTR_MODES)[number];

const LOAN_YEARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const DEPOSIT_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Full Loan" },
  { value: "10", label: "10%" },
  { value: "20", label: "20%" },
  { value: "30", label: "30%" },
  { value: "40", label: "40%" },
  { value: "50", label: "50%" },
  { value: "60", label: "60%" },
  { value: "70", label: "70%" },
  { value: "10000", label: "10000" },
  { value: "15000", label: "15000" },
  { value: "20000", label: "20000" },
  { value: "25000", label: "25000" },
  { value: "30000", label: "30000" },
  { value: "custom", label: "Custom Deposit" },
];

const NCD_OPTIONS = [0, 25, 30, 38.33, 45, 55] as const;

/* Output colors */
const COLOR = {
  sellingPrice: "#CFE8A9",
  insurance: "#B8E0F0",
  otrPrice: "#FFD200",
  downpayment: "#F0B8D0",
  loanAmount: "#A8D8F0",
  monthly: "#E53935",
  tabActive: "#E53935",
  tabInactive: "#111111",
  tabTextInactive: "#777777",
} as const;

/* ------------------------------------------------------------------ */
/*  CALCULATION                                                        */
/* ------------------------------------------------------------------ */

interface Result {
  sellingPrice: number;
  insuranceEstimate: number;
  otrPrice: number;
  downpayment: number;
  loanAmount: number;
  monthly: number;
}

function calculate(
  variant: Variant,
  otrMode: OtrMode,
  rebate: number,
  depositSelection: string,
  customDeposit: number,
  loanYears: number,
  interestPct: number,
  ncdPct: number
): Result {
  const sellingPrice = variant.otr;

  let insuranceEstimate = 0;
  if (otrMode === "Dengan Insurans") {
    insuranceEstimate = Math.round(variant.insurance * (1 - ncdPct / 100));
  }

  const otrPrice = sellingPrice + insuranceEstimate - rebate;

  let downpayment = 0;
  if (depositSelection === "custom") {
    downpayment = customDeposit;
  } else if (depositSelection === "0") {
    downpayment = 0;
  } else {
    const numVal = Number(depositSelection);
    if (numVal >= 100) {
      downpayment = numVal;
    } else {
      downpayment = Math.round(otrPrice * (numVal / 100));
    }
  }

  const loanAmount = Math.max(0, otrPrice - downpayment);

  let monthly = 0;
  if (loanAmount > 0 && loanYears > 0) {
    const totalInterest = loanAmount * (interestPct / 100) * loanYears;
    const totalPayment = loanAmount + totalInterest;
    const totalMonths = loanYears * 12;
    monthly = totalPayment / totalMonths;
  }

  return { sellingPrice, insuranceEstimate, otrPrice, downpayment, loanAmount, monthly };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/* ------------------------------------------------------------------ */
/*  HEADER WITH VIDEO                                                  */
/* ------------------------------------------------------------------ */

function ModelHeader({ model }: { model: CarModel }) {
  return (
    <div className="relative w-full overflow-hidden" style={{ height: 220 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={model.id}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {model.video ? (
            <video
              src={model.video}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={model.image}
              alt={model.name}
              className="w-full h-full object-cover"
            />
          )}
        </motion.div>
      </AnimatePresence>
      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      {/* Model name */}
      <div className="absolute bottom-4 left-5">
        <motion.h1
          key={model.id + "-title"}
          className="text-white font-black uppercase leading-none"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(48px, 8vw, 72px)",
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {model.name}
        </motion.h1>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RED CALCULATOR BAR                                                 */
/* ------------------------------------------------------------------ */

function CalcBar({ modelName }: { modelName: string }) {
  return (
    <div
      className="flex items-center gap-3 px-5 shadow-3d-row"
      style={{
        height: 60,
        background: "linear-gradient(90deg, #C62828, #E53935)",
      }}
    >
      <Calculator className="text-white flex-shrink-0" style={{ width: 26, height: 26 }} />
      <span
        className="text-white uppercase text-3d-white"
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 20,
          letterSpacing: "0.08em",
        }}
      >
        {modelName} Calculator
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  INPUT ROW                                                          */
/* ------------------------------------------------------------------ */

function InputRow({
  icon: Icon,
  label,
  children,
  bg = "yellow",
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  bg?: "yellow" | "amber";
}) {
  const bgStyle =
    bg === "yellow"
      ? { background: "linear-gradient(90deg, #FDE047, #FACC15)" }
      : { background: "linear-gradient(90deg, #FCD34D, #FBBF24)" };

  return (
    <div
      className="flex items-center justify-between px-5 shadow-3d-row"
      style={{ height: 54, ...bgStyle }}
    >
      <div className="flex items-center gap-3 flex-shrink-0">
        <Icon className="text-black/70 flex-shrink-0" style={{ width: 22, height: 22 }} />
        <span
          className="uppercase text-black/85"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
      </div>
      <div className="min-w-0" style={{ width: "50%" }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SELECT / INPUT COMPONENTS                                          */
/* ------------------------------------------------------------------ */

function FieldSelect({
  value,
  onChange,
  options,
  optionLabels,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: readonly (string | number)[];
  optionLabels?: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full rounded-md border border-black/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/40"
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          background: "rgba(0,0,0,0.18)",
          color: "#000",
          padding: "6px 32px 6px 12px",
        }}
      >
        {options.map((opt, i) => (
          <option key={opt} value={opt}>
            {optionLabels ? optionLabels[i] : opt}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute top-1/2 -translate-y-1/2 text-black/50 pointer-events-none"
        style={{ right: 8, width: 18, height: 18 }}
      />
    </div>
  );
}

function FieldInput({
  value,
  onChange,
  placeholder = "0",
  type = "number",
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="appearance-none w-full rounded-md border border-black/10 focus:outline-none focus:ring-2 focus:ring-red-500/40"
      style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: 15,
        background: "rgba(0,0,0,0.18)",
        color: "#000",
        padding: "6px 12px",
      }}
    />
  );
}

function DepositSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full rounded-md border border-black/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/40"
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          background: "rgba(0,0,0,0.18)",
          color: "#000",
          padding: "6px 32px 6px 12px",
        }}
      >
        {DEPOSIT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute top-1/2 -translate-y-1/2 text-black/50 pointer-events-none"
        style={{ right: 8, width: 18, height: 18 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NCD ROW                                                            */
/* ------------------------------------------------------------------ */

function NcdRow({ activeNcd, onChange }: { activeNcd: number; onChange: (v: number) => void }) {
  return (
    <div
      className="flex items-center justify-between px-5 shadow-3d-row"
      style={{
        height: 54,
        background: "linear-gradient(90deg, #FDE047, #FACC15)",
      }}
    >
      <div className="flex items-center gap-3 flex-shrink-0">
        <Shield className="text-black/70 flex-shrink-0" style={{ width: 22, height: 22 }} />
        <span
          className="uppercase text-black/85"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "0.04em",
          }}
        >
          NCD %
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {NCD_OPTIONS.map((ncd) => (
          <button
            key={ncd}
            onClick={() => onChange(ncd)}
            className="rounded-md transition-all duration-200"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: 13,
              padding: "5px 10px",
              background: activeNcd === ncd ? "#E53935" : "#fff",
              color: activeNcd === ncd ? "#fff" : "#000",
              boxShadow:
                activeNcd === ncd
                  ? "0 2px 8px rgba(229,57,53,0.35)"
                  : "0 1px 3px rgba(0,0,0,0.1)",
              transform: activeNcd === ncd ? "scale(1.05)" : "scale(1)",
            }}
          >
            {ncd}%
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RESULT ROW                                                         */
/* ------------------------------------------------------------------ */

function ResultRow({
  label,
  value,
  bgColor,
  icon: Icon,
}: {
  label: string;
  value: string;
  bgColor: string;
  icon?: React.ElementType;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 shadow-3d-row"
      style={{ height: 56, background: bgColor }}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <Icon className="text-black/50 flex-shrink-0" style={{ width: 22, height: 22 }} />
        )}
        <span
          className="uppercase text-black/80"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="tabular-nums text-black"
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 28,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MONTHLY BOX                                                        */
/* ------------------------------------------------------------------ */

function MonthlyBox({ monthly, loanYears }: { monthly: number; loanYears: number }) {
  const [key, setKey] = useState(0);
  const prev = useRef(monthly);
  const totalMonths = loanYears * 12;

  useEffect(() => {
    if (Math.abs(prev.current - monthly) > 0.01) {
      setKey((k) => k + 1);
      prev.current = monthly;
    }
  }, [monthly]);

  return (
    <div
      className="flex items-center justify-between px-6 relative overflow-hidden"
      style={{
        height: 120,
        background: COLOR.monthly,
      }}
    >
      {/* Glossy highlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 45%)",
        }}
      />

      {/* LEFT: MONTHLY + BULAN */}
      <div className="relative z-10 flex flex-col justify-center">
        <span
          className="text-white uppercase leading-none"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(36px, 5vw, 50px)",
            letterSpacing: "0.06em",
            textShadow: "0 3px 8px rgba(0,0,0,0.25)",
          }}
        >
          MONTHLY
        </span>
        <span
          className="text-white/75 uppercase leading-none"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(18px, 2.5vw, 24px)",
            letterSpacing: "0.1em",
            marginTop: 6,
          }}
        >
          {totalMonths} BULAN
        </span>
      </div>

      {/* RIGHT: Number */}
      <div className="relative z-10 text-right">
        <motion.span
          key={key}
          className="text-white tabular-nums leading-none"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(64px, 9vw, 96px)",
            textShadow: "0 4px 12px rgba(0,0,0,0.3)",
            letterSpacing: "-0.02em",
          }}
          initial={{ scale: 0.88, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
        >
          {fmt(monthly)}
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TAB BAR                                                            */
/* ------------------------------------------------------------------ */

function TabBar({
  models,
  activeId,
  onSelect,
}: {
  models: CarModel[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="flex overflow-x-auto no-scrollbar items-center px-3 gap-1.5"
      style={{ height: 56, background: "#0a0a0a" }}
    >
      {models.map((model) => {
        const isActive = model.id === activeId;
        return (
          <button
            key={model.id}
            onClick={() => onSelect(model.id)}
            className="flex-shrink-0 uppercase transition-all duration-200 whitespace-nowrap active:scale-95 rounded-lg"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: "0.04em",
              padding: "10px 16px",
              background: isActive ? COLOR.monthly : COLOR.tabInactive,
              color: isActive ? "#fff" : COLOR.tabTextInactive,
              boxShadow: isActive ? "0 2px 8px rgba(229,57,53,0.3)" : "none",
              transform: isActive ? "scale(1.04)" : "scale(1)",
            }}
          >
            {model.shortName}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [selectedId, setSelectedId] = useState("saga");
  const [variantIdx, setVariantIdx] = useState(0);
  const [otrMode, setOtrMode] = useState<OtrMode>("Dengan Insurans");
  const [rebate, setRebate] = useState(0);
  const [depositSel, setDepositSel] = useState("10");
  const [customDeposit, setCustomDeposit] = useState(0);
  const [loanYears, setLoanYears] = useState(9);
  const [interestPct, setInterestPct] = useState(2.28);
  const [ncdPct, setNcdPct] = useState(0);

  const model = useMemo(
    () => CAR_MODELS.find((m) => m.id === selectedId) ?? CAR_MODELS[0],
    [selectedId]
  );

  const variant = model.variants[variantIdx];

  const result = useMemo(
    () =>
      calculate(
        variant,
        otrMode,
        rebate,
        depositSel,
        customDeposit,
        loanYears,
        interestPct,
        ncdPct
      ),
    [variant, otrMode, rebate, depositSel, customDeposit, loanYears, interestPct, ncdPct]
  );

  const handleModelChange = useCallback((id: string) => {
    setSelectedId(id);
    setVariantIdx(0);
  }, []);

  const handleRebate = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") { setRebate(0); return; }
    const n = Number(v);
    if (!isNaN(n) && n >= 0) setRebate(n);
  }, []);

  const handleCustomDeposit = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") { setCustomDeposit(0); return; }
    const n = Number(v);
    if (!isNaN(n) && n >= 0) setCustomDeposit(n);
  }, []);

  const handleInterest = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") { setInterestPct(0); return; }
    const n = Number(v);
    if (!isNaN(n) && n >= 0) setInterestPct(n);
  }, []);

  const showCustomDeposit = depositSel === "custom";
  const yearLabels = LOAN_YEARS.map((y) => `${y} tahun`);

  return (
    <div
      className="min-h-screen flex justify-center"
      style={{ background: "#000000", fontFamily: "'Montserrat', sans-serif" }}
    >
      <div
        className="w-full overflow-hidden shadow-3d-card"
        style={{ maxWidth: 900, background: "#0a0a0a" }}
      >
        {/* ====== HEADER WITH VIDEO/IMAGE ====== */}
        <ModelHeader model={model} />

        {/* ====== RED CALC BAR ====== */}
        <CalcBar modelName={model.name} />

        {/* ====== INPUT ROWS ====== */}
        <div className="flex flex-col">
          <InputRow icon={Car} label="VARIAN" bg="yellow">
            <FieldSelect
              value={variantIdx}
              onChange={(v) => setVariantIdx(Number(v))}
              options={model.variants.map((_, i) => i)}
              optionLabels={model.variants.map((v) => v.name)}
            />
          </InputRow>

          <InputRow icon={Shield} label="OTR MODE" bg="amber">
            <FieldSelect
              value={otrMode}
              onChange={(v) => setOtrMode(v as OtrMode)}
              options={[...OTR_MODES]}
            />
          </InputRow>

          <InputRow icon={TrendingDown} label="REBATE" bg="yellow">
            <FieldInput
              value={rebate === 0 ? "" : rebate}
              onChange={handleRebate}
              placeholder="0"
            />
          </InputRow>

          <InputRow icon={Wallet} label="JENIS DEPOSIT" bg="amber">
            <DepositSelect value={depositSel} onChange={setDepositSel} />
          </InputRow>

          {/* Custom Deposit */}
          <AnimatePresence>
            {showCustomDeposit && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 54, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-5 shadow-3d-row"
                  style={{
                    height: 54,
                    background: "linear-gradient(90deg, #FCD34D, #FBBF24)",
                  }}
                >
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Banknote style={{ width: 22, height: 22 }} className="text-black/70" />
                    <span
                      className="uppercase text-black/85"
                      style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontWeight: 900,
                        fontSize: 16,
                        letterSpacing: "0.04em",
                      }}
                    >
                      CUSTOM (RM)
                    </span>
                  </div>
                  <div style={{ width: "50%" }}>
                    <FieldInput
                      value={customDeposit === 0 ? "" : customDeposit}
                      onChange={handleCustomDeposit}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <InputRow icon={Calendar} label="TAHUN LOAN" bg="yellow">
            <FieldSelect
              value={loanYears}
              onChange={(v) => setLoanYears(Number(v))}
              options={[...LOAN_YEARS]}
              optionLabels={yearLabels}
            />
          </InputRow>

          <InputRow icon={Percent} label="INTEREST %" bg="amber">
            <FieldInput
              value={interestPct}
              onChange={handleInterest}
              type="number"
              placeholder="2.28"
            />
          </InputRow>

          <NcdRow activeNcd={ncdPct} onChange={setNcdPct} />
        </div>

        {/* ====== OUTPUT ROWS ====== */}
        <div className="flex flex-col">
          <ResultRow
            label="SELLING PRICE"
            value={fmtInt(result.sellingPrice)}
            bgColor={COLOR.sellingPrice}
            icon={Tag}
          />
          <ResultRow
            label="INSURANCE ESTIMATE"
            value={fmtInt(result.insuranceEstimate)}
            bgColor={COLOR.insurance}
            icon={Shield}
          />
          <ResultRow
            label="OTR PRICE"
            value={fmtInt(result.otrPrice)}
            bgColor={COLOR.otrPrice}
            icon={Car}
          />
          <ResultRow
            label="DOWNPAYMENT"
            value={fmtInt(result.downpayment)}
            bgColor={COLOR.downpayment}
            icon={Banknote}
          />
          <ResultRow
            label="LOAN AMOUNT"
            value={fmtInt(result.loanAmount)}
            bgColor={COLOR.loanAmount}
            icon={CreditCard}
          />
        </div>

        {/* ====== MONTHLY BOX ====== */}
        <MonthlyBox monthly={result.monthly} loanYears={loanYears} />

        {/* ====== TAB BAR ====== */}
        <TabBar models={CAR_MODELS} activeId={selectedId} onSelect={handleModelChange} />

        {/* ====== FOOTER ====== */}
        <div className="text-center py-4" style={{ background: "#0a0a0a" }}>
          <p
            className="uppercase"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: "#555",
              letterSpacing: "0.06em",
            }}
          >
            Fariz Proton Cacu Calculator
          </p>
          <p
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: 10,
              color: "#444",
              marginTop: 2,
            }}
          >
            * Anggaran sahaja. Harga tertakluk kepada terma dan syarat.
          </p>
        </div>
      </div>
    </div>
  );
}
