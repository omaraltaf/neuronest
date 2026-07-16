'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Card data — emoji-first, word shown only AFTER tap (optional label) ────────
const CARD_SETS: Record<string, { emoji: string; word: string; sound: string; colour: string }[]> = {
  animals: [
    { emoji: '🐶', word: 'Dog',      sound: 'woof woof',  colour: '#F59E0B' },
    { emoji: '🐱', word: 'Cat',      sound: 'meow meow',  colour: '#E8635A' },
    { emoji: '🐦', word: 'Bird',     sound: 'tweet tweet',colour: '#5B7FE8' },
    { emoji: '🐟', word: 'Fish',     sound: 'blub blub',  colour: '#0891B2' },
    { emoji: '🐮', word: 'Cow',      sound: 'moo moo',    colour: '#16A34A' },
    { emoji: '🐸', word: 'Frog',     sound: 'ribbit!',    colour: '#16A34A' },
    { emoji: '🦁', word: 'Lion',     sound: 'roar!',      colour: '#D97706' },
    { emoji: '🐘', word: 'Elephant', sound: 'toot toot',  colour: '#7C3AED' },
  ],
  food: [
    { emoji: '🍎', word: 'Apple',  sound: 'crunch!',  colour: '#E8635A' },
    { emoji: '🍌', word: 'Banana', sound: 'yummy!',   colour: '#F59E0B' },
    { emoji: '🍕', word: 'Pizza',  sound: 'yummy!',   colour: '#D97706' },
    { emoji: '🍦', word: 'Ice cream', sound: 'yummy!', colour: '#5B7FE8' },
    { emoji: '🍓', word: 'Strawberry', sound: 'yummy!', colour: '#E8635A' },
    { emoji: '🥕', word: 'Carrot', sound: 'crunch!',  colour: '#F97316' },
    { emoji: '🍇', word: 'Grapes', sound: 'yummy!',   colour: '#7C3AED' },
    { emoji: '🧃', word: 'Juice',  sound: 'slurp!',   colour: '#16A34A' },
  ],
  shapes: [
    { emoji: '🔴', word: 'Circle',   sound: 'round and round!', colour: '#E8635A' },
    { emoji: '🟦', word: 'Square',   sound: 'four corners!',    colour: '#5B7FE8' },
    { emoji: '🔺', word: 'Triangle', sound: 'three sides!',     colour: '#16A34A' },
    { emoji: '⭐', word: 'Star',     sound: 'twinkle!',         colour: '#F59E0B' },
    { emoji: '❤️', word: 'Heart',   sound: 'I love you!',       colour: '#E8635A' },
    { emoji: '🟣', word: 'Oval',     sound: 'round!',           colour: '#7C3AED' },
  ],
  feelings: [
    { emoji: '😊', word: 'Happy',    sound: 'yay!',        colour: '#F59E0B' },
    { emoji: '😢', word: 'Sad',      sound: 'oh no...',    colour: '#5B7FE8' },
    { emoji: '😡', word: 'Angry',    sound: 'grrrr!',      colour: '#E8635A' },
    { emoji: '😨', word: 'Scared',   sound: 'eek!',        colour: '#7C3AED' },
    { emoji: '😴', word: 'Tired',    sound: 'yawn...',     colour: '#0891B2' },
    { emoji: '🤒', word: 'Sick',     sound: 'achoo!',      colour: '#16A34A' },
    { emoji: '🥰', word: 'Love',     sound: 'awww!',       colour: '#DB2777' },
    { emoji: '😌', word: 'Calm',     sound: 'ahhh...',     colour: '#16A34A' },
  ],
  actions: [
    { emoji: '🏃', word: 'Run',   sound: 'run run run!',   colour: '#16A34A' },
    { emoji: '🤸', word: 'Jump',  sound: 'boing!',         colour: '#F59E0B' },
    { emoji: '👏', word: 'Clap',  sound: 'clap clap clap!',colour: '#E8635A' },
    { emoji: '🙌', word: 'Hands up', sound: 'hands up!',  colour: '#7C3AED' },
    { emoji: '🤗', word: 'Hug',   sound: 'big hug!',       colour: '#F97316' },
    { emoji: '💃', word: 'Dance', sound: 'shake shake!',   colour: '#DB2777' },
    { emoji: '😴', word: 'Sleep', sound: 'shhh...',        colour: '#0891B2' },
    { emoji: '🍽️', word: 'Eat',  sound: 'nom nom nom!',   colour: '#16A34A' },
  ],
}

const GAME_MODES = [
  { id: 'animals',  icon: '🐾', label: 'Animals',  bg: 'from-amber-400 to-orange-400' },
  { id: 'food',     icon: '🍎', label: 'Food',     bg: 'from-red-400 to-pink-400' },
  { id: 'shapes',   icon: '🔴', label: 'Shapes',   bg: 'from-blue-400 to-indigo-400' },
  { id: 'feelings', icon: '😊', label: 'Feelings', bg: 'from-yellow-400 to-amber-400' },
  { id: 'actions',  icon: '🏃', label: 'Actions',  bg: 'from-green-400 to-emerald-400' },
  { id: 'songs',    icon: '🎵', label: 'Songs',    bg: 'from-purple-400 to-violet-400' },
]

// ── Song activity cards ────────────────────────────────────────────────────────
const SONGS = [
  {
    emoji: '✋', title: 'Head, Shoulders, Knees & Toes',
    colour: '#F59E0B',
    steps: [
      { emoji: '🤚', action: 'Touch HEAD' },
      { emoji: '💪', action: 'Touch SHOULDERS' },
      { emoji: '🦵', action: 'Touch KNEES' },
      { emoji: '🦶', action: 'Touch TOES' },
    ],
  },
  {
    emoji: '👏', title: 'If You\'re Happy',
    colour: '#E8635A',
    steps: [
      { emoji: '😊', action: 'Feel HAPPY' },
      { emoji: '👏', action: 'CLAP your hands' },
      { emoji: '🦶', action: 'STOMP your feet' },
      { emoji: '🤗', action: 'Say HOORAY' },
    ],
  },
  {
    emoji: '⭐', title: 'Twinkle Twinkle',
    colour: '#5B7FE8',
    steps: [
      { emoji: '⭐', action: 'Open and close HANDS' },
      { emoji: '☁️', action: 'Look UP at the sky' },
      { emoji: '🌙', action: 'It\'s like a DIAMOND' },
      { emoji: '✨', action: 'TWINKLE twinkle!' },
    ],
  },
  {
    emoji: '🐄', title: 'Old MacDonald',
    colour: '#16A34A',
    steps: [
      { emoji: '🚜', action: 'Old MacDonald had a FARM' },
      { emoji: '🐄', action: 'He had a COW — MOO MOO' },
      { emoji: '🐷', action: 'He had a PIG — OINK OINK' },
      { emoji: '🐔', action: 'He had a HEN — CLUCK CLUCK' },
    ],
  },
]

// ── Celebration overlay ────────────────────────────────────────────────────────
function CelebrationBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="text-center animate-bounce">
        <div className="text-8xl">⭐</div>
        <div className="text-4xl font-black text-white mt-2 drop-shadow-lg">Yes!</div>
      </div>
      <div className="absolute top-10 left-10 text-5xl animate-spin">🌟</div>
      <div className="absolute top-20 right-10 text-5xl animate-bounce">⭐</div>
      <div className="absolute bottom-20 left-20 text-4xl animate-pulse">✨</div>
      <div className="absolute bottom-10 right-20 text-5xl animate-spin">🌟</div>
    </div>
  )
}

// ── Visual flashcard game ──────────────────────────────────────────────────────
function FlashcardGame({
  cards, childName, onStar, onExit,
}: {
  cards: { emoji: string; word: string; sound: string; colour: string; image?: string }[]
  childName: string
  onStar: () => void
  onExit: () => void
}) {
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [done, setDone] = useState(false)
  const [sessionStars, setSessionStars] = useState(0)
  const card = cards[current]

  const handleTap = () => {
    if (!revealed) { setRevealed(true); return }
    // Star + next
    setCelebrating(true)
    onStar()
    setSessionStars(s => s + 1)
  }

  const handleCelebrationDone = () => {
    setCelebrating(false)
    if (current + 1 >= cards.length) {
      setDone(true)
    } else {
      setCurrent(c => c + 1)
      setRevealed(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
        <div className="text-7xl mb-4 animate-bounce">🏆</div>
        <div className="text-4xl font-black text-white mb-2">Amazing!</div>
        <div className="text-xl text-white/80 mb-2">{childName}!</div>
        <div className="text-5xl font-black text-yellow-300 mb-8">
          {'⭐'.repeat(Math.min(sessionStars, 8))}
        </div>
        <div className="flex gap-4">
          <button onClick={() => { setCurrent(0); setRevealed(false); setDone(false); setSessionStars(0) }}
            className="px-6 py-3 bg-white text-violet-600 font-black rounded-2xl text-base">
            🔄 Again!
          </button>
          <button onClick={onExit}
            className="px-6 py-3 bg-white/20 text-white font-bold rounded-2xl text-base border border-white/30">
            🏠 Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: card.colour }}>
      {celebrating && <CelebrationBurst onDone={handleCelebrationDone} />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <button onClick={onExit} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white text-xl">←</button>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full transition-all"
              style={{ background: i === current ? '#fff' : 'rgba(255,255,255,0.3)', transform: i === current ? 'scale(1.3)' : 'scale(1)' }} />
          ))}
        </div>
        <div className="text-white font-black text-lg">{sessionStars}⭐</div>
      </div>

      {/* Main card — tap target */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <button
          onClick={handleTap}
          className="w-full max-w-xs active:scale-95 transition-transform"
          style={{ WebkitTapHighlightColor: 'transparent' }}>

          {/* Card face */}
          <div className="rounded-3xl shadow-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}>

            {/* AAC symbol when generated (white panel, like a real communication card);
                giant emoji until then */}
            {card.image ? (
              <div className="flex items-center justify-center pt-8 pb-2 px-8">
                <div className="bg-white rounded-3xl p-3 shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image} alt={card.word}
                    style={{ width: 180, height: 180, objectFit: 'contain' }} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-10">
                <span style={{ fontSize: '120px', lineHeight: 1 }}>{card.emoji}</span>
              </div>
            )}

            {/* Word — only shown after tap */}
            <div className="pb-8 px-4 text-center min-h-[80px] flex flex-col items-center justify-center">
              {revealed ? (
                <>
                  <div className="text-4xl font-black text-white tracking-wide">{card.word}</div>
                  <div className="text-white/70 text-lg mt-1">{card.sound}</div>
                  <div className="mt-4 bg-white/20 rounded-2xl px-6 py-2.5">
                    <span className="text-white font-black text-base">⭐ Tap for a star!</span>
                  </div>
                </>
              ) : (
                <div className="text-white/60 text-lg font-semibold">Tap to see!</div>
              )}
            </div>
          </div>
        </button>

        {/* Skip */}
        {revealed && (
          <button onClick={() => { if (current + 1 >= cards.length) setDone(true); else { setCurrent(c => c + 1); setRevealed(false) } }}
            className="mt-4 text-white/50 text-sm underline">
            Skip →
          </button>
        )}
      </div>

      {/* Parent prompt at bottom */}
      <div className="px-6 pb-8 text-center">
        <div className="text-white/40 text-xs">
          {!revealed ? `Say: "What is this?"` : `Say: "${card.word}! ${card.sound}"`}
        </div>
      </div>
    </div>
  )
}

// ── Song activity ──────────────────────────────────────────────────────────────
function SongActivity({ onExit, childName, onStar }: { onExit: () => void; childName: string; onStar: () => void }) {
  const [activeSong, setActiveSong] = useState<typeof SONGS[0] | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [celebrating, setCelebrating] = useState(false)

  if (activeSong) {
    const step = activeSong.steps[stepIdx]
    const isLast = stepIdx === activeSong.steps.length - 1

    return (
      <div className="min-h-screen flex flex-col" style={{ background: activeSong.colour }}>
        {celebrating && <CelebrationBurst onDone={() => { setCelebrating(false); if (isLast) { setActiveSong(null); setStepIdx(0) } else setStepIdx(s => s + 1) }} />}
        <div className="flex items-center px-4 pt-5">
          <button onClick={() => { setActiveSong(null); setStepIdx(0) }}
            className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white text-xl">←</button>
          <div className="flex-1 text-center">
            <div className="text-white font-black text-base">{activeSong.title}</div>
          </div>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="flex gap-1.5 mb-8">
            {activeSong.steps.map((_, i) => (
              <div key={i} className="w-3 h-3 rounded-full" style={{ background: i <= stepIdx ? '#fff' : 'rgba(255,255,255,0.3)' }} />
            ))}
          </div>

          <div className="rounded-3xl p-10 mb-6 w-full max-w-xs"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize: '100px', lineHeight: 1 }}>{step.emoji}</div>
          </div>

          <div className="text-3xl font-black text-white mb-8">{step.action}</div>

          <button onClick={() => { setCelebrating(true); onStar() }}
            className="w-full max-w-xs py-5 rounded-3xl text-2xl font-black text-white active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.25)' }}>
            {isLast ? '🏁 Finish!' : '⭐ Next!'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
      <div className="flex items-center px-4 pt-5 pb-4">
        <button onClick={onExit} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white text-xl">←</button>
        <div className="flex-1 text-center text-white font-black text-lg">🎵 Songs</div>
        <div className="w-10" />
      </div>
      <div className="px-4 space-y-3 pb-8">
        {SONGS.map(song => (
          <button key={song.title} onClick={() => { setActiveSong(song); setStepIdx(0) }}
            className="w-full rounded-2xl p-5 text-left active:scale-95 transition-transform"
            style={{ background: song.colour + '40', border: `2px solid ${song.colour}60` }}>
            <div className="flex items-center gap-4">
              <div className="text-5xl">{song.emoji}</div>
              <div>
                <div className="font-black text-white text-base leading-tight">{song.title}</div>
                <div className="text-white/60 text-sm mt-0.5">{song.steps.length} steps</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Home screen ────────────────────────────────────────────────────────────────
function HomeScreen({ childName, stars, onStart, myWordsLabel }: {
  childName: string
  stars: number
  onStart: (gameId: string) => void
  myWordsLabel: string | null
}) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)' }}>
      {/* Back + stars */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <Link href="/dashboard" className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white text-xl">←</Link>
        <div className="text-white font-black text-lg">⭐ {stars}</div>
      </div>

      {/* Greeting */}
      <div className="text-center px-6 pb-6">
        <div className="text-7xl mb-3">👋</div>
        <div className="text-4xl font-black text-white">{childName}!</div>
        <div className="text-white/70 text-lg mt-1">What do you want to play?</div>
      </div>

      {/* Game grid */}
      <div className="px-4 grid grid-cols-2 gap-3 pb-8">
        {/* "My Words" — the child's goal vocabulary, always first when available */}
        {myWordsLabel && (
          <button onClick={() => onStart('my-words')}
            className="rounded-3xl p-5 text-center bg-gradient-to-br from-yellow-300 to-amber-400 active:scale-95 transition-transform shadow-lg col-span-2 border-2 border-white/40">
            <div className="text-5xl mb-2">⭐</div>
            <div className="font-black text-white text-base">{myWordsLabel}</div>
          </button>
        )}
        {GAME_MODES.map(game => (
          <button key={game.id} onClick={() => onStart(game.id)}
            className={`rounded-3xl p-5 text-center bg-gradient-to-br ${game.bg} active:scale-95 transition-transform shadow-lg`}>
            <div className="text-5xl mb-2">{game.icon}</div>
            <div className="font-black text-white text-base">{game.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
function ChildZoneContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [childName, setChildName] = useState('')
  const [stars, setStars] = useState(0)
  const [activeGame, setActiveGame] = useState<string | null>(null)
  const [goalCards, setGoalCards] = useState<{
    setLabel: string
    cards: { emoji: string; word: string; sound: string; colour: string; image?: string }[]
  } | null>(null)

  useEffect(() => {
    if (!childId) return
    supabase.from('children').select('name').eq('id', childId).single()
      .then(({ data }) => { if (data) setChildName(data.name) })
    supabase.from('app_state').select('total_stars').eq('child_id', childId).maybeSingle()
      .then(({ data }) => { if (data) setStars(data.total_stars || 0) })
    // "My Words" — cards generated from the child's active goals (CLAUDE.md §5.5),
    // Fitzgerald-coloured, with AAC symbol images when generated (emoji until then).
    // Served from cache when goals are unchanged; regenerated server-side otherwise.
    fetch(`/api/child-zone-cards?child=${childId}`)
      .then(res => res.json())
      .then(async ({ cards, contentId }) => {
        if (!cards?.cards?.length) return
        type CardData = { emoji: string; word: string; concept?: string; sound: string; colour: string }
        const cardList = cards.cards as CardData[]

        // AAC symbol images: concept-keyed shared library first (aac_symbols); sets
        // cached before the concept switch fall back to the old per-content
        // story_images cache until they regenerate on the next goal change
        const imageByConcept: Record<string, string> = {}
        const conceptList = cardList.map(c => (c.concept || '').toLowerCase()).filter(Boolean)
        if (conceptList.length) {
          const { data: symbols } = await supabase.from('aac_symbols')
            .select('concept, storage_path').in('concept', conceptList)
          for (const s of symbols || []) {
            const { data: urlData } = supabase.storage
              .from('neuronest-documents').getPublicUrl(s.storage_path as string)
            imageByConcept[s.concept as string] = urlData.publicUrl
          }
        }
        const imageByIndex: Record<number, string> = {}
        if (!conceptList.length && contentId) {
          const { data: images } = await supabase.from('story_images')
            .select('sentence_index, storage_path').eq('content_id', contentId)
          for (const img of images || []) {
            const { data: urlData } = supabase.storage
              .from('neuronest-documents').getPublicUrl(img.storage_path as string)
            imageByIndex[img.sentence_index as number] = urlData.publicUrl
          }
        }
        setGoalCards({
          setLabel: cards.set_label || 'My Words',
          cards: cardList.map((c, i) => ({
            emoji: c.emoji, word: c.word, sound: c.sound, colour: c.colour,
            image: imageByConcept[(c.concept || '').toLowerCase()] || imageByIndex[i],
          })),
        })
      })
      .catch(() => {}) // generic sets still work if generation is unavailable
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addStar = async () => {
    const newTotal = stars + 1
    setStars(newTotal)
    await supabase.from('app_state').update({ total_stars: newTotal }).eq('child_id', childId)
  }

  if (!activeGame) {
    return <HomeScreen childName={childName} stars={stars} onStart={setActiveGame}
      myWordsLabel={goalCards?.setLabel || null} />
  }

  if (activeGame === 'songs') {
    return <SongActivity onExit={() => setActiveGame(null)} childName={childName} onStar={addStar} />
  }

  const cards = activeGame === 'my-words' && goalCards
    ? goalCards.cards
    : CARD_SETS[activeGame] || CARD_SETS.animals
  return (
    <FlashcardGame
      cards={cards}
      childName={childName}
      onStar={addStar}
      onExit={() => setActiveGame(null)}
    />
  )
}

export default function ChildZonePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
        <div className="text-7xl animate-pulse">✨</div>
      </div>
    }>
      <ChildZoneContent />
    </Suspense>
  )
}
