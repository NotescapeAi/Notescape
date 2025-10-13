import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Loader2, Wand2, BookOpen } from "lucide-react"

type Props = {
  classId: string | number
  onGenerate?: (classId: number) => Promise<void> | void
}

const LS_DIFF_KEY = "fc_pref_difficulty"

export default function ClassHeaderButtons({ classId, onGenerate }: Props) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const toId = Number(classId)

  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    (localStorage.getItem(LS_DIFF_KEY) as any) || "medium"
  )

  useEffect(() => {
    localStorage.setItem(LS_DIFF_KEY, difficulty)
  }, [difficulty])

  const handleGenerate = async () => {
    if (!toId) return
    if (!onGenerate) {
      navigate(`/classes/${toId}/flashcards`)
      return
    }
    try {
      setBusy(true)
      await onGenerate(toId)
      navigate(`/classes/${toId}/flashcards`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="flex flex-wrap items-center gap-3"
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Difficulty Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold uppercase">
          Difficulty
        </span>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as any)}
          className="rounded-full border border-slate-300 bg-gradient-to-r from-violet-50 to-violet-100 text-violet-700 text-sm font-semibold px-3 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400 cursor-pointer hover:shadow-sm transition-all"
        >
          <option value="easy">Easy 🟢</option>
          <option value="medium">Medium 🟡</option>
          <option value="hard">Hard 🔴</option>
        </select>
      </div>

      {/* Generate Button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.03 }}
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-all ${
          busy
            ? "bg-slate-200 text-slate-600 cursor-not-allowed"
            : "bg-violet-600 text-white hover:bg-violet-700 shadow-md hover:shadow-lg"
        }`}
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Wand2 size={16} />
            Generate Flashcards
          </>
        )}
      </motion.button>

      {/* View Button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.03 }}
        type="button"
        onClick={() => navigate(`/classes/${toId}/flashcards`)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-400 text-violet-700 bg-white font-semibold text-sm hover:bg-violet-50 shadow-sm hover:shadow transition-all"
      >
        <BookOpen size={16} />
        View Flashcards
      </motion.button>
    </motion.div>
  )
}
