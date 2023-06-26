import requests
import csv
import urllib.parse
import psycopg2
import os
from geopy.distance import distance
import time
def get_all_nodes():
    # Establish a connection
    conn = psycopg2.connect(
        host='db-postgresql-sfo2-32856-do-user-13737111-0.b.db.ondigitalocean.com',
        port=25060,
        user='doadmin',
        password='AVNS_MHGwE5WNGWUy_wvn_-l',
        database='az3_deployment',
        sslmode='require'
    )

    # Create a cursor
    cur = conn.cursor()

    # Query to retrieve table names
    cur.execute("""
        SELECT *
        FROM nodes
    """)

    # Fetch all table names
    rows = cur.fetchall()

    # Print the table names
    # for row in rows:
    #     print(row)

    # Close the cursor and connection
    cur.close()
    conn.close()
    return rows


def encode_for_url(string):
    print(string)
    encoded_string = urllib.parse.quote(string.replace(".","").replace(",","").replace("  "," ").strip().replace("Hwy 4",""))
    return encoded_string

# url = "https://nominatim.openstreetmap.org/search/?q=" +text +"&limit=5&format=json&addressdetails=1"
import csv

def read_csv_file(filename):
    with open(filename, 'r') as csv_file:
        reader = csv.reader(csv_file)
        for row in reader:
            print(row)

# Example usage
# filename = 'data.csv'
# read_csv_file(filename)
def find_closest(data,coord):
    smallest = ""
    sm_place = ""
    for place in data:
        print(place["display_name"],"---->",coord)
        # print((place["lat"], place["lon"]),"  ",(coord[0],coord[1]))
        # dist = distance((place["lat"], place["lon"]),(coord[0],coord[1])).meters
        # print(dist," ",type(dist))
        # if(smallest == ""):
        #     smallest = dist
        #     sm_place = place
        # elif(smallest>dist):
        #     smallest = dist
        #     sm_place = place
    print(sm_place)

def write_data(rows):
    header = ["Address","Old coords","New coords"]
    with open('comparisons.csv', 'w', encoding='UTF8') as f:
        writer = csv.writer(f)

        # write the header
        writer.writerow(header)

        # write the data
        # writer.writerow(data)
        for row in rows:
            writer.writerow([row[0],"{0} {1}".format(row[1][0], row[1][1]),"{0} {1}".format(row[2][0], row[2][1])])
def get_accurate_lat_longs():
    csv_rows = []
    rows = get_all_nodes()

    for row in rows:
        # row = list(row)
        print("------------------------------------")
        if("Address not available" not in row[3]):
            text = encode_for_url(row[3])
            url = "https://nominatim.openstreetmap.org/search/?q="+text+"%20"+row[4].strip().replace(" ","%20")+"%20"+row[5].replace(" ","")+"&format=json&addressdetails=1"
            #url = "https://geocode.maps.co/search?q="+text+"%20"+row[4].strip().replace(" ","%20")+"%20"+row[5]
            print(url)
            response = requests.get(url)
            
            data = response.json()
            if(len(data) > 1):
                print("length greater ", (row[8],row[7]))
                closest = find_closest(data,row[2])
                # continue

            if(len(data) < 1):
                print("Skipping as not found")
                continue
            data = data[0]

            if data['lon'] != row[8] or row[7] != data['lat']:
                print("old coords ({0},{1})".format(row[7],row[8]),"  ","new coords ({0},{1})".format(data['lon'],data['lat']))
                csv_rows.append([row[3],(row[7],row[8]),(data['lon'],data['lat'])])
            print("----------------------------------")
    write_data(csv_rows)
            # time.sleep(0.51)


    return rows
#get_accurate_lat_longs()
with open("comparisons.csv","r") as r:
    reader = csv.reader(r,  delimiter=',')

    conn = psycopg2.connect(
        host='db-postgresql-sfo2-32856-do-user-13737111-0.b.db.ondigitalocean.com',
        port=25060,
        user='doadmin',
        password='AVNS_MHGwE5WNGWUy_wvn_-l',
        database='az3_deployment',
        sslmode='require'
    )

    # Create a cursor
    cur = conn.cursor()

    # Iterate over the rows
    skip = True
    for row in reader:
        if skip:
            skip = False
            continue
        if(row != []):
            address = row[0]
            longitude = row[2].split(" ")[0]
            latitude = row[2].split(" ")[1]
            print(longitude," ",latitude)
            # Update the "long" and "lat" columns in the "nodes" table
            cur.execute("""
                UPDATE nodes
                SET long = %s, lat = %s
                WHERE address = %s
            """, (longitude, latitude, address))

    # Commit the changes to the database
    conn.commit()

    # Close the cursor and connection
    cur.close()
    conn.close()
#print(encode_for_url("Safeway-Brentwood #2621"))