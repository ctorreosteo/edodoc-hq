## Multi-stage build: Maven (JDK 21) -> runtime (JRE 21)

FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace

# Copy Maven wrapper first to leverage layer caching
COPY .mvn .mvn
COPY mvnw pom.xml ./

RUN chmod +x mvnw \
  && ./mvnw -DskipTests dependency:go-offline

# Now copy sources and build
COPY src src

RUN ./mvnw -DskipTests package


FROM eclipse-temurin:21-jre-jammy AS runtime

WORKDIR /app

# Run as non-root
RUN useradd -u 10001 -r -m -s /usr/sbin/nologin appuser

COPY --from=build /workspace/target/*.jar /app/app.jar

# Le credenziali Google non stanno nell'immagine: si montano in /app/config
RUN mkdir -p /app/config

ENV SERVER_PORT=8081
ENV SPRING_PROFILES_ACTIVE=prod
ENV JAVA_OPTS="-XX:InitialRAMPercentage=50.0 -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8081

USER 10001

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dspring.profiles.active=${SPRING_PROFILES_ACTIVE} -Dserver.port=${SERVER_PORT} -jar /app/app.jar"]
