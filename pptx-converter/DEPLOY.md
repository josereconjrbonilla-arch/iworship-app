# Deploying pptx-converter -- one-time setup

Do this once (from Git Bash, in this `pptx-converter` folder, same terminal
you already use for `firebase deploy`). After this one-time setup, you
never touch this folder again unless the conversion logic itself needs to
change later.

## 1. Install the Google Cloud CLI (`gcloud`)

If `gcloud --version` in Git Bash already prints something, skip to step 2
-- you have it.

Otherwise: download and run the installer for Windows from
https://cloud.google.com/sdk/docs/install -- same kind of one-time
installer as Git itself, nothing to configure during install. Once it's
done, close and reopen Git Bash so it picks up the new `gcloud` command.

## 2. Sign in and point it at your project

```
gcloud auth login
```

This opens a browser window, same as `firebase login` did -- sign in with
whichever Google account owns the `iworship-ph` Firebase project.

```
gcloud config set project iworship-ph
```

## 3. Turn on the three Google Cloud APIs this needs (one-time, per project)

```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

(Run, Cloud Build, and Artifact Registry -- deploying FROM SOURCE, which
step 4 does, needs Cloud Build to actually build the container image and
Artifact Registry to store it; Cloud Run then runs it.)

## 4. Deploy

From inside this `pptx-converter` folder:

```
gcloud run deploy pptx-converter \
  --source . \
  --region asia-southeast1 \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 1 \
  --timeout 300
```

This uploads this folder to Google, builds the container THERE (no Docker
needed on your PC), and deploys it -- takes a few minutes the first time
(LibreOffice is a big package). `--no-allow-unauthenticated` means this
service only answers requests carrying a valid Google-signed token for
this project -- nobody else can call it, and there's no public URL to
accidentally leave open.

When it finishes, it prints a **Service URL** that looks like
`https://pptx-converter-xxxxxxxxxx-as.a.run.app` -- copy that, you need it
in the next two steps.

## 5. Let the Cloud Functions themselves call this service

```
gcloud run services add-iam-policy-binding pptx-converter \
  --region=asia-southeast1 \
  --member="serviceAccount:$(gcloud projects describe iworship-ph --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

This is the one-time permission grant that lets `convertPptxToSlideshow`
(in `functions/index.js`) actually reach the service you just deployed --
without it, the function would get a 403 the first time someone tries to
upload a PowerPoint.

## 6. Tell the Cloud Function where this service lives

In the `functions` folder (not this one), create a new file called `.env`
(exactly that name, no extension) with one line:

```
PPTX_CONVERTER_URL=https://pptx-converter-xxxxxxxxxx-as.a.run.app
```

-- using the real Service URL step 4 printed, not this placeholder.

## 7. Deploy the Cloud Functions as usual

```
cd ../functions
firebase deploy --only functions
```

(Same command you've already run before for the other functions -- this
one just also happens to pick up the new `.env` file and the new
`convertPptxToSlideshow` function.)

That's it -- from here on, uploading a `.pptx` from Media Library -> ADD
MEDIA -> SLIDESHOW -> UPLOAD A POWERPOINT (.PPTX) in the app just works.

## If you ever need to redeploy this service itself

Only needed if the conversion logic in `server.js`/`Dockerfile` changes
(I'll tell you if that ever happens) -- just repeat step 4 alone; the
service URL stays the same, so steps 5/6 don't need to be redone.
