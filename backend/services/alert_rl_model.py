"""
Deep Q-Learning model for personalized commodity alert recommendations.
Uses reinforcement learning to optimize alert accuracy and user satisfaction.
"""
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import numpy as np
from collections import deque, namedtuple
import random
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
import logging

logger = logging.getLogger(__name__)

# Experience replay buffer structure
Experience = namedtuple('Experience', 
    ['state', 'action', 'reward', 'next_state', 'done'])

class CommodityAlertDQN(nn.Module):
    """
    Deep Q-Network for commodity alert recommendations.
    
    State features include:
    - Preprocessed news features (sentiment, keywords, etc.)
    - User preference history
    - Market indicators
    - Time-based features
    
    Actions represent:
    - Send alert / Don't send alert
    - Alert priority levels (high, medium, low)
    - Commodity-specific alerts
    """
    
    def __init__(self, state_size: int = 128, action_size: int = 10, 
                 hidden_sizes: List[int] = [256, 128, 64]):
        super(CommodityAlertDQN, self).__init__()
        
        # Build the neural network layers
        layers = []
        input_size = state_size
        
        for hidden_size in hidden_sizes:
            layers.append(nn.Linear(input_size, hidden_size))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(0.2))
            input_size = hidden_size
        
        # Output layer
        layers.append(nn.Linear(input_size, action_size))
        
        self.network = nn.Sequential(*layers)
        
    def forward(self, x):
        return self.network(x)

class AlertRecommendationAgent:
    """
    RL Agent that learns to recommend alerts based on user feedback and market outcomes.
    """
    
    def __init__(self, 
                 state_size: int = 128,
                 action_size: int = 10,
                 learning_rate: float = 0.001,
                 gamma: float = 0.95,
                 epsilon: float = 1.0,
                 epsilon_min: float = 0.01,
                 epsilon_decay: float = 0.995,
                 buffer_size: int = 10000,
                 batch_size: int = 32,
                 update_target_every: int = 100):
        
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.batch_size = batch_size
        self.update_target_every = update_target_every
        self.learn_step_counter = 0
        
        # Neural networks
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.q_network = CommodityAlertDQN(state_size, action_size).to(self.device)
        self.target_network = CommodityAlertDQN(state_size, action_size).to(self.device)
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        
        # Experience replay buffer
        self.memory = deque(maxlen=buffer_size)
        
        # Action mappings
        self.action_mappings = {
            0: {"send_alert": False, "priority": None},
            1: {"send_alert": True, "priority": "low"},
            2: {"send_alert": True, "priority": "medium"},
            3: {"send_alert": True, "priority": "high"},
            # Commodity-specific actions
            4: {"send_alert": True, "priority": "high", "commodity": "wheat"},
            5: {"send_alert": True, "priority": "high", "commodity": "corn"},
            6: {"send_alert": True, "priority": "high", "commodity": "soybeans"},
            7: {"send_alert": True, "priority": "high", "commodity": "oil"},
            8: {"send_alert": True, "priority": "high", "commodity": "gold"},
            9: {"send_alert": True, "priority": "high", "commodity": "silver"}
        }
        
        # Model save path
        self.model_dir = os.path.join(os.path.dirname(__file__), "..", "models", "rl_alert_model")
        os.makedirs(self.model_dir, exist_ok=True)
        
    def create_state_vector(self, 
                           news_features: Dict[str, Any],
                           user_preferences: Dict[str, Any],
                           market_context: Dict[str, Any]) -> np.ndarray:
        """
        Create a state vector from various features.
        
        Args:
            news_features: Preprocessed news and sentiment analysis
            user_preferences: User's historical preferences and behavior
            market_context: Current market conditions and indicators
        """
        state_components = []
        
        # News and sentiment features
        sentiment_scores = news_features.get("sentiment_scores", {})
        state_components.extend([
            sentiment_scores.get("bullish", 0.0),
            sentiment_scores.get("bearish", 0.0),
            sentiment_scores.get("neutral", 0.0),
            news_features.get("confidence_score", 0.0),
            float(news_features.get("severity", 0)),
            float(news_features.get("urgency", 0))
        ])
        
        # Keyword presence (binary features)
        keywords = news_features.get("keywords", [])
        important_keywords = ["shortage", "surplus", "weather", "harvest", "price", 
                            "export", "import", "demand", "supply", "forecast"]
        for keyword in important_keywords:
            state_components.append(float(any(kw in keyword for kw in keywords)))
        
        # User preference features
        pref_commodities = user_preferences.get("preferred_commodities", [])
        all_commodities = ["wheat", "corn", "soybeans", "oil", "gold", "silver"]
        for commodity in all_commodities:
            state_components.append(float(commodity in pref_commodities))
        
        # User behavior statistics
        state_components.extend([
            user_preferences.get("alert_click_rate", 0.0),
            user_preferences.get("alert_dismiss_rate", 0.0),
            user_preferences.get("avg_response_time", 0.0),
            float(user_preferences.get("preferred_alert_frequency", 3))
        ])
        
        # Market context features
        state_components.extend([
            market_context.get("volatility_index", 0.0),
            market_context.get("trend_strength", 0.0),
            float(market_context.get("trading_hours", 0)),
            float(market_context.get("day_of_week", 0) / 7.0)
        ])
        
        # Time-based features
        current_hour = datetime.now().hour
        state_components.extend([
            np.sin(2 * np.pi * current_hour / 24),  # Cyclic hour encoding
            np.cos(2 * np.pi * current_hour / 24)
        ])
        
        # Pad or truncate to match state_size
        state_vector = np.array(state_components[:self.state_size])
        if len(state_vector) < self.state_size:
            state_vector = np.pad(state_vector, (0, self.state_size - len(state_vector)))
        
        return state_vector.astype(np.float32)
    
    def act(self, state: np.ndarray, training: bool = True) -> int:
        """
        Choose an action using epsilon-greedy policy.
        """
        if training and random.random() <= self.epsilon:
            return random.randrange(self.action_size)
        
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        self.q_network.eval()
        with torch.no_grad():
            q_values = self.q_network(state_tensor)
        self.q_network.train()
        
        return np.argmax(q_values.cpu().data.numpy())
    
    def remember(self, state: np.ndarray, action: int, reward: float, 
                 next_state: np.ndarray, done: bool):
        """
        Store experience in replay buffer.
        """
        self.memory.append(Experience(state, action, reward, next_state, done))
    
    def calculate_reward(self, 
                        action: int,
                        predicted_outcome: Dict[str, Any],
                        actual_outcome: Dict[str, Any],
                        user_feedback: Optional[Dict[str, Any]] = None) -> float:
        """
        Calculate reward based on prediction accuracy and user satisfaction.
        
        Rewards:
        - Correct price movement prediction: +10
        - Correct severity assessment: +5
        - User clicked on alert: +3
        - User found alert helpful: +5
        - False positive (alert sent, no significant movement): -5
        - False negative (no alert, significant movement): -8
        - User dismissed/complained: -3
        """
        reward = 0.0
        action_info = self.action_mappings[action]
        
        # Did we send an alert?
        if action_info["send_alert"]:
            # Check price movement accuracy
            predicted_direction = predicted_outcome.get("price_direction", "neutral")
            actual_direction = actual_outcome.get("price_direction", "neutral")
            
            if predicted_direction == actual_direction and actual_direction != "neutral":
                reward += 10.0
            elif actual_direction == "neutral":
                # False positive - sent alert but no movement
                reward -= 5.0
            else:
                # Wrong direction
                reward -= 3.0
            
            # Check severity accuracy
            if predicted_outcome.get("severity") == actual_outcome.get("severity"):
                reward += 5.0
            
            # User feedback
            if user_feedback:
                if user_feedback.get("clicked", False):
                    reward += 3.0
                if user_feedback.get("found_helpful", False):
                    reward += 5.0
                if user_feedback.get("dismissed_immediately", False):
                    reward -= 3.0
                if user_feedback.get("marked_irrelevant", False):
                    reward -= 5.0
        else:
            # We didn't send an alert
            actual_movement = actual_outcome.get("price_change_percent", 0)
            if abs(actual_movement) > 2.0:  # Significant movement threshold
                # False negative - should have sent alert
                reward -= 8.0
            else:
                # Correct decision not to alert
                reward += 2.0
        
        # Bonus for matching user's commodity preferences
        if action_info.get("commodity") in predicted_outcome.get("user_preferences", {}).get("commodities", []):
            reward += 2.0
        
        return reward
    
    def replay(self):
        """
        Train the model on a batch of experiences from the replay buffer.
        """
        if len(self.memory) < self.batch_size:
            return
        
        batch = random.sample(self.memory, self.batch_size)
        states = torch.FloatTensor([e.state for e in batch]).to(self.device)
        actions = torch.LongTensor([e.action for e in batch]).to(self.device)
        rewards = torch.FloatTensor([e.reward for e in batch]).to(self.device)
        next_states = torch.FloatTensor([e.next_state for e in batch]).to(self.device)
        dones = torch.FloatTensor([e.done for e in batch]).to(self.device)
        
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))
        next_q_values = self.target_network(next_states).max(1)[0].detach()
        target_q_values = rewards + (self.gamma * next_q_values * (1 - dones))
        
        loss = F.mse_loss(current_q_values.squeeze(), target_q_values)
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        # Update target network
        self.learn_step_counter += 1
        if self.learn_step_counter % self.update_target_every == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())
        
        # Decay epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
    
    def save_model(self, episode: int = 0):
        """
        Save the model weights and training state.
        """
        checkpoint = {
            'episode': episode,
            'model_state_dict': self.q_network.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'epsilon': self.epsilon,
            'learn_step_counter': self.learn_step_counter
        }
        torch.save(checkpoint, os.path.join(self.model_dir, f'checkpoint_episode_{episode}.pth'))
        
        # Also save the latest model
        torch.save(self.q_network.state_dict(), os.path.join(self.model_dir, 'latest_model.pth'))
    
    def load_model(self, checkpoint_path: Optional[str] = None):
        """
        Load model weights from checkpoint.
        """
        if checkpoint_path is None:
            checkpoint_path = os.path.join(self.model_dir, 'latest_model.pth')
        
        if os.path.exists(checkpoint_path):
            if checkpoint_path.endswith('.pth'):
                self.q_network.load_state_dict(torch.load(checkpoint_path, map_location=self.device))
                self.target_network.load_state_dict(self.q_network.state_dict())
            else:
                checkpoint = torch.load(checkpoint_path, map_location=self.device)
                self.q_network.load_state_dict(checkpoint['model_state_dict'])
                self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                self.epsilon = checkpoint['epsilon']
                self.learn_step_counter = checkpoint['learn_step_counter']
                self.target_network.load_state_dict(self.q_network.state_dict())
            
            logger.info(f"Model loaded from {checkpoint_path}")
            return True
        return False
    
    def get_recommendation(self, 
                          news_features: Dict[str, Any],
                          user_preferences: Dict[str, Any],
                          market_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get alert recommendation for given context.
        """
        state = self.create_state_vector(news_features, user_preferences, market_context)
        action = self.act(state, training=False)
        action_info = self.action_mappings[action]
        
        # Get Q-values for confidence scores
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.q_network(state_tensor).cpu().numpy()[0]
        
        # Calculate confidence based on Q-value difference
        sorted_q_values = np.sort(q_values)[::-1]
        confidence = float(sorted_q_values[0] - sorted_q_values[1]) / (sorted_q_values[0] + 1e-8)
        
        return {
            "send_alert": action_info["send_alert"],
            "priority": action_info.get("priority"),
            "commodity_focus": action_info.get("commodity"),
            "confidence": min(confidence, 1.0),
            "q_values": q_values.tolist(),
            "recommended_action": action
        }

# Global agent instance
alert_agent = AlertRecommendationAgent()

def train_alert_model_online(experience_data: Dict[str, Any]):
    """
    Train the model with a single experience (online learning).
    
    Args:
        experience_data: Dictionary containing:
            - news_features: Preprocessed news data
            - user_preferences: User's preferences
            - market_context: Market conditions
            - action_taken: What action was actually taken
            - predicted_outcome: What we predicted would happen
            - actual_outcome: What actually happened
            - user_feedback: How the user responded
    """
    # Create state vectors
    state = alert_agent.create_state_vector(
        experience_data["news_features"],
        experience_data["user_preferences"],
        experience_data["market_context"]
    )
    
    # Calculate reward
    reward = alert_agent.calculate_reward(
        experience_data["action_taken"],
        experience_data["predicted_outcome"],
        experience_data["actual_outcome"],
        experience_data.get("user_feedback")
    )
    
    # Create next state (could be the new market state after some time)
    next_state = alert_agent.create_state_vector(
        experience_data.get("next_news_features", experience_data["news_features"]),
        experience_data["user_preferences"],
        experience_data.get("next_market_context", experience_data["market_context"])
    )
    
    # Store experience and learn
    done = experience_data.get("session_ended", False)
    alert_agent.remember(state, experience_data["action_taken"], reward, next_state, done)
    alert_agent.replay()
    
    return {"reward": reward, "epsilon": alert_agent.epsilon}

def get_alert_recommendation(news_data: Dict[str, Any], 
                           user_id: str,
                           user_preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Get personalized alert recommendation for a user.
    """
    # Default user preferences if not provided
    if user_preferences is None:
        user_preferences = {
            "preferred_commodities": ["wheat", "corn"],
            "alert_click_rate": 0.5,
            "alert_dismiss_rate": 0.2,
            "avg_response_time": 30.0,
            "preferred_alert_frequency": 3
        }
    
    # Get current market context
    market_context = {
        "volatility_index": 0.5,  # This would come from market data
        "trend_strength": 0.3,
        "trading_hours": 1 if 9 <= datetime.now().hour <= 16 else 0,
        "day_of_week": datetime.now().weekday()
    }
    
    # Get recommendation
    recommendation = alert_agent.get_recommendation(
        news_data,
        user_preferences,
        market_context
    )
    
    recommendation["user_id"] = user_id
    recommendation["timestamp"] = datetime.now().isoformat()
    
    return recommendation

# Initialize and optionally load pre-trained model
alert_agent.load_model()
