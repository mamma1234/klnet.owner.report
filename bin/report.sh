cd ..

docker build -t klnet.owner.report .

docker stop report

docker run -d -it --rm --name "report" --network server -p 5007:5007 -v /DATA/KLNET/OWNER:/OWNER klnet.owner.report

echo "build finish"

docker logs -f report
