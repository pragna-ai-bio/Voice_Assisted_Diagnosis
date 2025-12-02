import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import pickle

# Load datasets
train_data = pd.read_csv("model_training/dataset/train_data.txt", header=None)
test_data  = pd.read_csv("model_training/dataset/test_data.txt", header=None)

# TRAIN DATA extract features + labels
X_train = train_data.iloc[:, 1:27].values     # 26 features
y_train = train_data.iloc[:, 28].values       # class label (29th column)

# TEST DATA extract features + labels
X_test = test_data.iloc[:, 1:27].values       # 26 features
y_test = test_data.iloc[:, 27].values         # class label (28th column)

# Train Random Forest
model = RandomForestClassifier(n_estimators=300, random_state=42)
model.fit(X_train, y_train)

print("Testing accuracy:", model.score(X_test, y_test))

# Save model
pickle.dump(model, open("pd_model.pkl", "wb"))
print("Model saved as pd_model.pkl")
