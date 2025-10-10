# build with .NET 9 SDK
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish -c Release -o /app/publish

# run on .NET 9 runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:5014
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 5014
ENTRYPOINT ["dotnet", "backend.dll"]   # adjust if your dll name differs
