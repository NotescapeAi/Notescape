import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { listDueCards, postReview } from "../lib/api";
import { ArrowLeft } from "lucide-react";

// Type definition
interface Flashcard {
  card_id: string;
  difficulty: number;
  retrievability: number;
  stability: number;
  difficulty_factor: number;
  question: string;
  answer: string;
  next_review?: string;
  isDue?: boolean;
  class_id?: string;
  last_reviewed?: string;
  scheduled_reappear?: string;
}

// Utility to format date in PKT - handle undefined case
const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return "Not scheduled";
  
  const date = new Date(dateStr);
  return date.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    hour12: true,
    timeZoneName: "short",
  });
};

const FlashcardsStudyMode = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [rating, setRating] = useState(3);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [className, setClassName] = useState("");
  const [justReappearedCard, setJustReappearedCard] = useState<string | null>(null);

  // Initial fetch of cards
  useEffect(() => {
    const fetchCards = async () => {
      try {
        const data = await listDueCards(Number(classId));
        console.log("Fetched Cards:", data);

        const updatedCards = data.map((card: Flashcard) => ({
          ...card,
          isDue: true,
        }));

        setCards(updatedCards);
        if (data.length > 0) {
          setClassName(data[0].class_id || "");
        }
      } catch (error) {
        console.error("Error fetching cards:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
  }, [classId]);

  // Check every second for cards that should reappear AND SWITCH TO THEM
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = new Date();
      let reappearedCardId: string | null = null;
      
      const updatedCards = cards.map((card) => {
        if (card.scheduled_reappear && !card.isDue) {
          const reappearTime = new Date(card.scheduled_reappear);
          if (currentTime >= reappearTime) {
            console.log(`Card ${card.card_id} reappeared at ${formatDate(card.scheduled_reappear)}`);
            reappearedCardId = card.card_id;
            return {
              ...card,
              isDue: true,
              scheduled_reappear: undefined
            };
          }
        }
        return card;
      });

      // If a card reappeared, update cards and switch to it immediately
      if (reappearedCardId) {
        setCards(updatedCards);
        
        const reappearedIndex = updatedCards.findIndex(card => card.card_id === reappearedCardId);
        if (reappearedIndex !== -1) {
          console.log(`Auto-switching to reappeared card at index: ${reappearedIndex}`);
          setIdx(reappearedIndex);
          setJustReappearedCard(reappearedCardId);
          setRevealed(false);
          // Clear the highlight after 3 seconds
          setTimeout(() => setJustReappearedCard(null), 3000);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cards, idx]);

  // Handle review submission
  const handleReview = async () => {
    if (cards.length === 0) return;

    const card = cards[idx];
    const reviewData = {
      card_id: card.card_id,
      difficulty: rating,
      retrievability: card.retrievability,
      stability: card.stability,
      difficulty_factor: card.difficulty_factor,
      question: card.question,
      answer: card.answer,
    };

    console.log("Review Data:", reviewData);
    setLoading(true);

    try {
      const response = await postReview(reviewData);
      if (response.success) {
        let updatedCard: Flashcard;
        
        if (rating === 1) {
          // For rating 1: Schedule to reappear after exactly 1 minute
          const reappearTime = new Date();
          reappearTime.setMinutes(reappearTime.getMinutes() + 1);
          
          updatedCard = {
            ...card,
            ...response.updated_state,
            isDue: false,
            scheduled_reappear: reappearTime.toISOString()
          };
          
          console.log(`Card scheduled to reappear at: ${formatDate(updatedCard.scheduled_reappear)}`);
        } else {
          // For ratings 2-5: Also set scheduled_reappear using the next_review from API
          const nextReview = response.updated_state.next_review || "";
          updatedCard = {
            ...card,
            ...response.updated_state,
            isDue: new Date() >= new Date(nextReview),
            scheduled_reappear: nextReview // Set scheduled_reappear for auto-switch
          };
        }

        setCards((prevCards) =>
          prevCards.map((c) =>
            c.card_id === updatedCard.card_id ? updatedCard : c
          )
        );

        if (rating === 1) {
          alert(`This card will reappear in 1 minute (at ${formatDate(updatedCard.scheduled_reappear)})`);
        } else {
          alert(`Next review for this card is scheduled for: ${formatDate(updatedCard.next_review)}`);
        }

        // Move to next available card
        findAndSetNextAvailableCard();
        
      } else {
        alert("Failed to submit review. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("An error occurred while submitting your review. Please try again.");
    } finally {
      setLoading(false);
      setRevealed(false);
    }
  };

  // Helper function to find and set next available card
  const findAndSetNextAvailableCard = () => {
    if (cards.length === 0) return;
    
    let nextAvailableIndex = -1;
    for (let i = 1; i < cards.length; i++) {
      const nextIdx = (idx + i) % cards.length;
      if (cards[nextIdx].isDue) {
        nextAvailableIndex = nextIdx;
        break;
      }
    }
    
    if (nextAvailableIndex !== -1) {
      setIdx(nextAvailableIndex);
    }
  };

  // Navigation handlers - only navigate to available cards
  const handleNext = () => {
    if (cards.length === 0) return;
    
    let nextIndex = idx;
    for (let i = 1; i <= cards.length; i++) {
      const potentialIndex = (idx + i) % cards.length;
      if (cards[potentialIndex].isDue) {
        nextIndex = potentialIndex;
        break;
      }
    }
    
    setIdx(nextIndex);
    setRevealed(false);
    setJustReappearedCard(null);
  };

  const handlePrevious = () => {
    if (cards.length === 0) return;
    
    let prevIndex = idx;
    for (let i = 1; i <= cards.length; i++) {
      const potentialIndex = (idx - i + cards.length) % cards.length;
      if (cards[potentialIndex].isDue) {
        prevIndex = potentialIndex;
        break;
      }
    }
    
    setIdx(prevIndex);
    setRevealed(false);
    setJustReappearedCard(null);
  };

  // Count available cards for display
  const availableCards = cards.filter(card => card.isDue);
  const currentCard = cards[idx];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      {/* Header - Compact */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link 
                to={`/classes/${classId}/flashcards`} 
                replace 
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </Link>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Study Mode</h1>
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-blue-600">{className}</span>
                  <span className="ml-2">
                    Due: {availableCards.length} · Total: {cards.length}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Progress Stats */}
            <div className="text-right">
              <div className="text-sm text-slate-600">
                Card <span className="font-semibold text-slate-800">{idx + 1}</span> of <span className="font-semibold text-slate-800">{cards.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Fixed height */}
      <div className="flex-1 flex items-center justify-center p-6">
        {loading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-slate-600 mt-4">Loading your flashcards...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 w-full max-w-2xl">
            {cards.length > 0 ? (
              <div className="space-y-6">
                {/* Card Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {justReappearedCard === currentCard.card_id && (
                      <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-xs font-medium animate-pulse">
                        🔄 Just Reappeared!
                      </span>
                    )}
                  </div>
                  {!currentCard.isDue && (
                    <div className="text-xs text-slate-500">
                      {currentCard.scheduled_reappear ? (
                        <span className="text-orange-600">
                          Reappears: {formatDate(currentCard.scheduled_reappear)}
                        </span>
                      ) : (
                        <span className="text-blue-600">
                          Next: {formatDate(currentCard.next_review)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Question */}
                <div>
                  <p className="text-xl font-medium text-slate-800 leading-relaxed text-center mb-4">
                    {currentCard.question}
                  </p>
                </div>

                {/* Answer Section */}
                <div className="text-center">
                  <button
                    onClick={() => setRevealed(!revealed)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none transition-colors text-sm"
                  >
                    <span>{revealed ? "Hide Answer" : "Show Answer"}</span>
                  </button>

                  {revealed && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-lg text-slate-700 leading-relaxed">
                        {currentCard.answer}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rating Section */}
                <div>
                  <p className="text-md font-semibold text-slate-800 mb-3 text-center">
                    How well did you know this?
                  </p>
                  
                  <div className="max-w-md mx-auto">
                    <div className="flex justify-between mb-3">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          onClick={() => setRating(num)}
                          className={`w-10 h-10 rounded-full transition-all ${
                            rating === num 
                              ? "bg-blue-600 text-white shadow-lg transform scale-110" 
                              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                      <span>Very Hard</span>
                      <span>Very Easy</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleReview}
                    disabled={!currentCard.isDue}
                    className={`w-full py-3 rounded-lg font-semibold transition-all text-sm ${
                      currentCard.isDue 
                        ? "bg-green-600 hover:bg-green-700 text-white shadow-md" 
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {currentCard.isDue ? "Submit Review" : "Not Available for Review"}
                  </button>

                  <div className="flex gap-3">
                    <button
                      onClick={handlePrevious}
                      className="flex-1 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={handleNext}
                      className="flex-1 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">📚</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No cards available</h3>
                <p className="text-slate-500 text-sm">
                  All cards have been reviewed. Please wait for the next review time.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlashcardsStudyMode;