import React, { useState } from "react";
import type { Flashcard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, RotateCcw } from "lucide-react";

interface FlashcardViewProps {
  cards: Flashcard[];
  onReview: (cardId: number, known: boolean) => void;
  isReviewing?: boolean;
}

export function FlashcardView({ cards, onReview, isReviewing }: FlashcardViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleFlip = () => {
    if (!completed) setIsFlipped(!isFlipped);
  };

  const handleNext = (known: boolean) => {
    if (completed) return;
    
    const card = cards[currentIndex];
    onReview(card.id, known);
    
    setIsFlipped(false);
    
    setTimeout(() => {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCompleted(true);
      }
    }, 150);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompleted(false);
  };

  if (cards.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No flashcards available for this source.
      </div>
    );
  }

  if (completed) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-sm">
          <Check className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold mb-3">Deck Complete!</h2>
        <p className="text-muted-foreground mb-8">You've reviewed all cards in this session.</p>
        <Button size="lg" onClick={handleRestart} data-testid="button-restart-deck">
          <RotateCcw className="w-4 h-4 mr-2" />
          Review Again
        </Button>
      </div>
    );
  }

  const card = cards[currentIndex];

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      <div className="w-full mb-8 flex justify-between items-center text-sm font-medium text-muted-foreground">
        <span>Card {currentIndex + 1} of {cards.length}</span>
        <span>{Math.round((currentIndex / cards.length) * 100)}%</span>
      </div>

      {/* The Flashcard */}
      <div 
        className="w-full h-80 sm:h-96 perspective-1000 cursor-pointer group mb-10"
        onClick={handleFlip}
        data-testid={`flashcard-view-${card.id}`}
      >
        <div 
          className={`w-full h-full relative transition-transform duration-500 transform-style-3d ${isFlipped ? "rotate-y-180" : ""}`}
        >
          {/* Front */}
          <Card className="absolute inset-0 backface-hidden bg-card border-2 flex flex-col p-8 sm:p-12 shadow-md hover:shadow-lg transition-shadow">
            <div className="text-xs uppercase tracking-wider font-semibold text-primary mb-4">Question</div>
            <div className="flex-1 flex items-center justify-center">
              <h3 className="text-xl sm:text-2xl font-serif text-center leading-relaxed text-foreground">{card.question}</h3>
            </div>
            <div className="text-xs text-center text-muted-foreground mt-4 opacity-50 group-hover:opacity-100 transition-opacity">
              Click to flip
            </div>
          </Card>
          
          {/* Back */}
          <Card className="absolute inset-0 backface-hidden bg-primary text-primary-foreground border-2 border-primary flex flex-col p-8 sm:p-12 rotate-y-180 shadow-md">
            <div className="text-xs uppercase tracking-wider font-semibold text-primary-foreground/70 mb-4">Answer</div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-lg sm:text-xl font-serif text-center leading-relaxed">{card.answer}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`w-full flex gap-4 transition-all duration-300 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <Button 
          variant="outline" 
          size="lg" 
          className="flex-1 h-14 text-base border-2 font-medium"
          onClick={(e) => { e.stopPropagation(); handleNext(false); }}
          disabled={!isFlipped || isReviewing}
          data-testid="button-mark-unknown"
        >
          <X className="w-5 h-5 mr-2 text-destructive" />
          Still Learning
        </Button>
        <Button 
          size="lg" 
          className="flex-1 h-14 text-base font-medium"
          onClick={(e) => { e.stopPropagation(); handleNext(true); }}
          disabled={!isFlipped || isReviewing}
          data-testid="button-mark-known"
        >
          <Check className="w-5 h-5 mr-2" />
          Got it
        </Button>
      </div>
    </div>
  );
}
