from db import initialize_database, list_tracks
from ingest import search, download

initialize_database()

results = search("daft punk one more time")
for r in results:
    print(r)

first_id = results[0]["id"]
print(download(first_id))
print(list_tracks())
print(download(first_id))  # should be instant