'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const GAMES = [
  { id: 'flashcards', icon: '🃏', label: 'Flashcards', desc: 'Match pictures and words' },
  { id: 'sounds',     icon: '🎵', label: 'Songs',      desc: 'Sing-along and movement' },
  { id: 'shapes',     icon: '🔴', label: 'Shapes',     desc: 'Sort colours and shapes' },
  { id: 'animals',    icon: '🐾', label: 'Animals',    desc: 'Learn animal names' },
]

const COLOURS = ['#E8635A','#5B7FE8','#16A34A','#F59E0B','#7C3AED','#0891B2']

function ChildZoneContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [childName, setChildName] = useState('')
  const [stars, setStars] = useState(0)
  const [activeGame, setActiveGame] = useState<string | null>(null)
  const [cards, setCards] = useState<{ word: string; emoji: string; colour: string }[]>([])
  const [currentCard, setCurrentCard] = useState(0)
  const [showWord, setShowWord] = useState(false)
  const [sessionStars, setSessionStars] = useState(0)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    if (!childId) return
    supabase.from('children').select('name').eq('id', childId).single()
      .then(({ data }) => { if (data) setChildName(data.name) })
    supabase.from('app_state').select('total_stars').eq('child_id', childId).maybeSingle()
      .then(({ data }) => { if (data) setStars(data.total_stars || 0) })
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = (gameId: string) => {
    setActiveGame(gameId)
    setCurrentCard(0)
    setShowWord(false)
    setSessionStars(0)
    if (gameId === 'flashcards') {
      setCards([
        { word: 'Ball', emoji: '⚽', colour: COLOURS[0] },
        { word: 'Cat', emoji: '🐱', colour: COLOURS[1] },
        { word: 'Apple', emoji: '🍎', colour: COLOURS[2] },
        { word: 'Car', emoji: '🚗', colour: COLOURS[3] },
        { word: 'Dog', emoji: '🐶', colour: COLOURS[4] },
        { word: 'Sun', emoji: '☀️', colour: COLOURS[5] },
      ])
    }
    if (gameId === 'animals') {
      setCards([
        { word: 'Dog', emoji: '🐶', colour: COLOURS[0] },
        { word: 'Cat', emoji: '🐱', colour: COLOURS[1] },
        { word: 'Bird', emoji: '🐦', colour: COLOURS[2] },
        { word: 'Fish', emoji: '🐟', colour: COLOURS[3] },
        { word: 'Cow', emoji: '🐮', colour: COLOURS[4] },
        { word: 'Sheep', emoji: '🐑', colour: COLOURS[5] },
      ])
    }
    if (gameId === 'shapes') {
      setCards([
        { word: 'Circle', emoji: '🔴', colour: COLOURS[0] },
        { word: 'Square', emoji: '🟦', colour: COLOURS[1] },
        { word: 'Triangle', emoji: '🔺', colour: COLOURS[2] },
        { word: 'Star', emoji: '⭐', colour: COLOURS[5] },
        { word: 'Heart', emoji: '❤️', colour: COLOURS[0] },
        { word: 'Diamond', emoji: '💎', colour: COLOURS[3] },
      ])
    }
  }

  const celebrate = async () => {
    setCelebrating(true)
    const newSessionStars = sessionStars + 1
    setSessionStars(newSessionStars)
    setTimeout(() => setCelebrating(false), 1200)

    const next = currentCard + 1
    if (next >= cards.length) {
      // Session complete
      const newTotal = stars + newSessionStars
      setStars(newTotal)
      await supabase.from('app_state').update({ total_stars: newTotal }).eq('child_id', childId)
      setActiveGame('complete')
    } else {
      setCurrentCard(next)
      setShowWord(false)
    }
  }

  if (activeGame === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-400 via-indigo-400 to-sky-400 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-6xl mb-4 animate-bounce">🌟</div>
        <h1 className="text-3xl font-black text-white mb-2">Amazing, {childName}!</h1>
        <div className="text-white/80 text-lg mb-6">You got {sessionStars} stars! ⭐</div>
        <div className="text-white font-bold text-2xl mb-8">Total stars: {stars} ⭐</div>
        <div className="flex gap-3">
          <button onClick={() => setActiveGame(null)}
            className="px-6 py-3 bg-white text-violet-600 font-black rounded-2xl text-sm">
            Play again
          </button>
          <Link href="/dashboard"
            className="px-6 py-3 bg-white/20 text-white font-bold rounded-2xl text-sm border border-white/30">
            Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (activeGame === 'songs') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-300 via-orange-300 to-red-300 flex flex-col">
        <header className="p-4 flex items-center justify-between">
          <button onClick={() => setActiveGame(null)} className="text-white text-2xl">←</button>
          <div className="text-white font-black text-lg">Songs 🎵</div>
          <div className="text-white font-bold">⭐ {stars}</div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {[
            { title: 'Head, Shoulders, Knees & Toes', emoji: '👤', instructions: 'Touch each body part as you say it!' },
            { title: 'Old MacDonald Had a Farm', emoji: '🐄', instructions: 'Make the animal sounds together!' },
            { title: 'If You\'re Happy and You Know It', emoji: '👏', instructions: 'Clap your hands and stomp your feet!' },
            { title: 'Twinkle Twinkle Little Star', emoji: '⭐', instructions: 'Open and close your hands like twinkling!' },
          ].map(song => (
            <div key={song.title} className="w-full bg-white/20 rounded-2xl p-4 mb-3 text-left">
              <div className="text-2xl mb-1">{song.emoji}</div>
              <div className="font-black text-white text-sm mb-1">{song.title}</div>
              <div className="text-white/80 text-xs">{song.instructions}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (activeGame && cards.length > 0) {
    const card = cards[currentCard]
    return (
      <div className="min-h-screen flex flex-col" style={{ background: card.colour }}>
        <header className="p-4 flex items-center justify-between">
          <button onClick={() => setActiveGame(null)} className="text-white text-2xl">←</button>
          <div className="text-white font-black">
            {currentCard + 1} / {cards.length}
          </div>
          <div className="text-white font-bold">⭐ {sessionStars}</div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {celebrating && (
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="text-8xl animate-bounce">⭐</div>
            </div>
          )}

          <button
            onClick={() => setShowWord(!showWord)}
            className="w-full max-w-xs bg-white/20 rounded-3xl p-8 text-center active:scale-95 transition mb-8">
            <div className="text-8xl mb-4">{card.emoji}</div>
            {showWord ? (
              <div className="text-3xl font-black text-white">{card.word}</div>
            ) : (
              <div className="text-white/60 text-sm">Tap to see the word</div>
            )}
          </button>

          <div className="flex gap-4">
            <button onClick={celebrate}
              className="px-8 py-4 bg-white text-gray-800 font-black rounded-2xl text-lg active:scale-95 transition shadow-lg">
              ⭐ Yes!
            </button>
            <button onClick={() => { setCurrentCard(c => Math.min(c + 1, cards.length - 1)); setShowWord(false) }}
              className="px-8 py-4 bg-white/20 text-white font-bold rounded-2xl text-lg active:scale-95 transition border border-white/40">
              Skip →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-400 via-indigo-500 to-sky-500">
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-white/70 text-2xl">←</Link>
        <div className="text-white font-black text-lg">✨ {childName}&apos;s Zone</div>
        <div className="text-white font-bold text-sm">⭐ {stars}</div>
      </header>

      <div className="px-4 pb-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">👋</div>
          <div className="text-2xl font-black text-white">Hi {childName}!</div>
          <div className="text-white/70 text-sm mt-1">What do you want to play today?</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {GAMES.map(game => (
            <button key={game.id} onClick={() => startGame(game.id)}
              className="bg-white/20 hover:bg-white/30 active:scale-95 rounded-2xl p-5 text-center transition border border-white/20">
              <div className="text-4xl mb-2">{game.icon}</div>
              <div className="font-black text-white text-sm">{game.label}</div>
              <div className="text-white/60 text-[10px] mt-0.5">{game.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 bg-white/10 rounded-2xl p-4 text-center border border-white/20">
          <div className="text-2xl mb-1">⭐</div>
          <div className="font-black text-white">{stars} stars collected!</div>
          <div className="text-white/60 text-xs mt-0.5">Keep playing to earn more</div>
        </div>
      </div>
    </div>
  )
}

export default function ChildZonePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}><div className="text-4xl animate-pulse">✨</div></div>}>
      <ChildZoneContent />
    </Suspense>
  )
}
