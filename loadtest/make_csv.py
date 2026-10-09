"""python loadtest/make_csv.py 2500  ->  loadtest/participants_2500.csv  (upload it in Admin > Participants of a TEST hackathon)"""
import csv, sys
n = int(sys.argv[1]) if len(sys.argv) > 1 else 2500
path = f"loadtest/participants_{n}.csv"
with open(path, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["email", "roll_number", "name", "college"])
    for i in range(1, n + 1): w.writerow([f"student{i}@test.local", f"R{i:05d}", f"Student {i}", "Load Test College"])
print("wrote", path)
