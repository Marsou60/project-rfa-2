import psycopg2, re
url = 'postgresql://postgres.ccoctyncllgpycagltrq:WhtCQJLV05Z58mTY@aws-1-eu-west-3.pooler.supabase.com:6543/postgres'
m = re.match(r'(?:postgresql|postgres)://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)', url)
conn = psycopg2.connect(host=m.group(3),port=int(m.group(4)),dbname=m.group(5),user=m.group(1),password=m.group(2),sslmode='require')
cur = conn.cursor()
cur.execute('SELECT id, username, role FROM "user"')
print("Utilisateurs actuels:")
for row in cur.fetchall():
    print(f"  id={row[0]}  username={row[1]}  role={row[2]}")
cur.execute('UPDATE "user" SET role = %s WHERE LOWER(username) = %s', ('COMMERCIAL', 'vanessa'))
print(f"\nVanessa mise a jour : {cur.rowcount} ligne(s)")
conn.commit()
conn.close()
