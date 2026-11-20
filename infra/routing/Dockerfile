FROM ghcr.io/project-osrm/osrm-backend:v6.0.0@sha256:729461bcc9ae9e6aafa92c0f93db9b060a32e85d5e72092c01ae4a4a9f1eb564 AS osrm

FROM osrm AS graph
WORKDIR /network
COPY metro-manila.osm.pbf .
RUN osrm-extract --threads 2 --profile /opt/car.lua metro-manila.osm.pbf \
    && osrm-partition --threads 2 metro-manila.osrm \
    && osrm-customize --threads 2 metro-manila.osrm \
    && rm metro-manila.osm.pbf

FROM osrm
COPY --from=graph --chown=65532:65532 /network/ /network/
USER 65532:65532
CMD ["osrm-routed", "--algorithm", "mld", "--threads", "2", "--verbosity", "WARNING", "/network/metro-manila.osrm"]
